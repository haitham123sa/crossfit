/*
 * H-FORGE optional cloud accounts.
 * Firebase credentials belong to the public web config, never to a billing or admin key.
 * Cloud remains OFF until firebase-config.js is filled in by the project owner.
 */
(() => {
  "use strict";
  const app=window.HForgeApp, $=id=>document.getElementById(id);
  const config=window.HFORGE_FIREBASE_CONFIG;
  const configured=!!(config&&config.apiKey&&config.authDomain&&config.projectId&&config.appId);
  let auth=null,db=null,A=null,F=null,currentUser=null,ready=false,working=false;
  let baseline=0,remote=null,changeToken=0,syncTimer=null,session=0,conflict=false;
  const key=uid=>"hforgeSyncV1:"+uid;
  function readMeta(uid){try{return JSON.parse(localStorage.getItem(key(uid)))||{revision:0,dirty:false}}catch{return{revision:0,dirty:false}}}
  function writeMeta(uid,revision,dirty){localStorage.setItem(key(uid),JSON.stringify({revision,dirty}))}
  function status(text){$("cloudStatus").textContent=text}
  function syncStatus(text){$("cloudSyncStatus").textContent=text}
  function error(text){$("cloudError").textContent=text||""}
  function show(id,value){$(id).classList.toggle("hidden",!value)}
  // Use a direct-click OAuth popup: GitHub Pages cannot proxy Firebase redirect
  // helpers needed by third-party-cookie-restricted Safari browsers.
  function googleProvider(){
    const provider=new A.GoogleAuthProvider();
    provider.setCustomParameters?.({prompt:"select_account"});
    return provider
  }
  function updateGoogleLink(user){
    const linked=!!(user?.providerData||[]).some(p=>p.providerId==="google.com");
    show("cloudGoogleLinkSection",!!user);
    show("cloudLinkGoogle",!!user&&!linked);
    $("cloudGoogleLinkStatus").textContent=linked
      ?"Google connected. You can sign in with Google and keep your existing PRs."
      :"Link Google to this existing account to sign in with Google without creating a separate PR profile."
  }
  function googleBusy(value){
    $("cloudGoogleSignIn").disabled=value;
    $("cloudLinkGoogle").disabled=value
  }
  async function googleAction(kind){
    if(!auth||working)return;
    const linking=kind==="link",prior=auth.currentUser,uid=prior?.uid;
    if(linking&&(!prior||!currentUser||currentUser.uid!==uid)){
      error("Sign in to your existing H-FORGE account before linking Google.");return
    }
    if(!linking&&prior){error("Already signed in. Use Link Google in Settings.");return}
    if(linking&&(prior.providerData||[]).some(p=>p.providerId==="google.com")){
      updateGoogleLink(prior);return
    }
    error("");working=true;googleBusy(true);
    try{
      if(linking){
        // Never sign into Google as another profile when linking: keep Firebase UID.
        const result=await A.linkWithPopup(prior,googleProvider());
        if(result.user.uid!==uid)throw new Error("Account UID changed during linking");
        updateGoogleLink(result.user);
        status("Google linked to your current H-FORGE account. Your PRs are unchanged.")
      }else{
        // Firebase onAuthStateChanged loads the UID's original local and cloud data.
        // Don't merge users by matching email addresses.
        await A.signInWithPopup(auth,googleProvider())
      }
    }catch(e){error(handleError(e))}
    finally{working=false;googleBusy(false)}
  }

  // Reuse the same account form on the welcome gate and inside Settings.
  // The tools stay inert and hidden until Firebase confirms a signed-in user.
  function lockApp(){
    // Keep the form INSIDE the stacked mobile column; never append to #authGate
    // itself (a flex container), which created a two-column iPhone layout.
    $("authGateFormSlot").appendChild($("cloudCard"));
    document.body.classList.add("auth-locked");
    document.body.classList.remove("auth-unlocked");
    $("appShell").inert=true;
    $("appShell").setAttribute("aria-hidden","true");
    $("authGate").removeAttribute("aria-hidden");
    window.scrollTo?.({top:0,behavior:"instant"})
  }
  function unlockApp(){
    $("cloudCardSlot").appendChild($("cloudCard"));
    $("appShell").inert=false;
    $("appShell").removeAttribute("aria-hidden");
    $("authGate").setAttribute("aria-hidden","true");
    document.body.classList.remove("auth-locked");
    document.body.classList.add("auth-unlocked");
    window.scrollTo?.({top:0,behavior:"instant"})
  }
  function handleError(err){
    const code=err&&err.code;
    const messages={
      "auth/invalid-credential":"Email or password is incorrect.",
      "auth/invalid-email":"Enter a valid email address.",
      "auth/email-already-in-use":"An account with this email already exists.",
      "auth/weak-password":"Choose a stronger password.",
      "auth/too-many-requests":"Too many attempts. Please try again later.",
      "auth/popup-blocked":"Your browser blocked Google sign-in. Open H-FORGE in Safari or allow pop-ups and try again.",
      "auth/popup-closed-by-user":"Google sign-in was cancelled. No records were changed.",
      "auth/cancelled-popup-request":"Another Google sign-in request replaced this one. Please try again.",
      "auth/unauthorized-domain":"Google sign-in is not authorized on this website. Contact the H-FORGE owner.",
      "auth/operation-not-allowed":"Google sign-in is unavailable. Try email/password.",
      "auth/operation-not-supported-in-this-environment":"Google sign-in is unsupported here. Open H-FORGE in Safari.",
      "auth/account-exists-with-different-credential":"An H-FORGE account already uses this email. Sign in with email/password first, then Link Google account in Settings to keep your PRs.",
      "auth/credential-already-in-use":"This Google identity is linked to another account. Your PRs have not changed.",
      "auth/provider-already-linked":"Google is already linked.",
      "auth/requires-recent-login":"For security, sign in again with email/password before linking Google.",
      "permission-denied":"Cloud access was denied. Check the Firestore security rules.",
      "resource-exhausted":"The free cloud quota was reached. Your changes remain on this device.",
      "unavailable":"Cloud is unavailable right now. Your changes remain on this device."
    };
    return messages[code]||"Cloud request failed. Your device data is still saved."
  }
  function remoteRef(uid){return F.doc(db,"profiles",uid)}
  function snapshotData(){
    const data=app.getState();
    return {preferredUnit:data.preferredUnit,inventory:data.inventory,prs:data.prs};
  }
  function ensureSize(data){
    if(data.prs.length>500)throw Object.assign(new Error("Too many entries"),{code:"hforge/too-many-records"});
    if(JSON.stringify(data).length>700000)throw Object.assign(new Error("Profile too large"),{code:"hforge/profile-too-large"});
  }
  function markDirty(){
    if(!currentUser)return;
    changeToken++;
    writeMeta(currentUser.uid,baseline,true);
    syncStatus("Changes saved on this device. Sync pending.");
    scheduleSync()
  }
  function scheduleSync(){
    clearTimeout(syncTimer);
    if(!currentUser||!ready||conflict)return;
    syncTimer=setTimeout(()=>{syncNow()},2300)
  }
  async function syncNow(){
    if(!currentUser||working||!ready||conflict)return;
    const user=currentUser,uid=user.uid,token=changeToken,expected=baseline;
    const data=snapshotData();
    try{ensureSize(data)}catch(e){syncStatus("Cloud sync limit reached. Export a backup; your local data is safe.");return}
    working=true;error("");syncStatus("Syncing changes to your private cloud profile…");
    try{
      await F.runTransaction(db,async tx=>{
        const ref=remoteRef(uid),snap=await tx.get(ref);
        const rev=snap.exists()?Number(snap.data().revision)||0:0;
        if(rev!==expected)throw Object.assign(new Error("Cloud version changed"),{code:"hforge/conflict"});
        tx.set(ref,{schemaVersion:1,revision:rev+1,data,updatedAt:F.serverTimestamp()})
      });
      if(currentUser?.uid!==uid)return;
      baseline=expected+1;
      const hasMoreChanges=token!==changeToken;
      writeMeta(uid,baseline,hasMoreChanges);
      syncStatus(hasMoreChanges?"Newer changes waiting to sync.":"Synced securely. Your PRs are backed up.");
      if(hasMoreChanges)scheduleSync()
    }catch(e){
      if(currentUser?.uid!==uid)return;
      writeMeta(uid,baseline,true);
      if(e.code==="hforge/conflict"){
        ready=false;
        syncStatus("Cloud changed on another device. Checking both copies…");
        await checkCloud(uid,session,true)
      }else if(e.code==="hforge/too-many-records"||e.code==="hforge/profile-too-large"){
        syncStatus("Your profile is too large for the free cloud limit. Local data is safe.")
      }else syncStatus(handleError(e))
    }finally{working=false}
  }
  function acceptCloud(){
    if(!currentUser||!remote)return;
    const uid=currentUser.uid;
    if(!window.confirm("Use your cloud copy on this device? Export a backup first if this device has edits you still need."))return;
    app.applyCloudData(remote.data);
    baseline=remote.revision;writeMeta(uid,baseline,false);
    ready=true;conflict=false;remote=null;show("cloudConflict",false);
    syncStatus("Cloud copy loaded. Future edits will sync automatically.");error("")
  }
  function keepDevice(){
    if(!currentUser||!remote)return;
    if(!window.confirm("Replace the cloud copy with this device's records? Cloud-only changes may be lost. Export a backup first."))return;
    baseline=remote.revision;
    writeMeta(currentUser.uid,baseline,true);
    ready=true;conflict=false;remote=null;show("cloudConflict",false);
    syncNow()
  }
  async function checkCloud(uid,attempt,fromConflict=false){
    try{
      const docSnap=await F.getDoc(remoteRef(uid));
      if(attempt!==session||currentUser?.uid!==uid)return;
      const meta=readMeta(uid),hasLocal=app.hasAccountCache(uid);
      if(docSnap.exists()){
        const cloud=docSnap.data();
        if(cloud.schemaVersion!==1||!cloud.data||!Array.isArray(cloud.data.prs))throw new Error("Unrecognized cloud data");
        const revision=Number(cloud.revision)||0;
        if(meta.dirty&&revision!==meta.revision){
          conflict=true;ready=false;remote={revision,data:cloud.data};
          show("cloudConflict",true);
          syncStatus("Cloud and device versions differ. Choose one below after exporting a backup.");
          return
        }
        baseline=revision;
        if(!hasLocal||!meta.dirty){app.applyCloudData(cloud.data);writeMeta(uid,revision,false)}
        else writeMeta(uid,revision,true);
        ready=true;conflict=false;remote=null;show("cloudConflict",false);
        syncStatus(meta.dirty?"Local changes are ready to sync.":"Cloud account synced. Local offline copy available.");
        if(meta.dirty)scheduleSync()
      }else{
        baseline=0;ready=true;conflict=false;remote=null;show("cloudConflict",false);
        writeMeta(uid,0,meta.dirty);
        syncStatus("No cloud backup yet. Tap Sync now or add a PR to create one.");
        if(meta.dirty)scheduleSync()
      }
    }catch(e){
      if(attempt!==session||currentUser?.uid!==uid)return;
      ready=false;conflict=false;
      syncStatus("Cloud is unreachable. Saved account records on this device are still available.");
      error(handleError(e))
    }
  }
  async function handleUser(user){
    session++;
    const attempt=session;
    clearTimeout(syncTimer);currentUser=user||null;
    ready=false;working=false;remote=null;conflict=false;baseline=0;changeToken=0;
    show("cloudConflict",false);error("");
    if(!user){
      lockApp();
      app.switchProfile(null);
      show("cloudAuthForm",true);show("cloudSignedIn",false);
      updateGoogleLink(null);
      status("Sign in or create a free account to access H-FORGE. Your existing device PRs are preserved.");
      return
    }
    const uid=user.uid;
    const hasLocal=app.hasAccountCache(uid);
    app.switchProfile(uid);
    show("cloudAuthForm",false);show("cloudSignedIn",true);
    updateGoogleLink(user);
    unlockApp();
    $("cloudEmail").textContent=user.email||"Signed-in account";
    status("Signed in. Your account has a separate local profile.");
    syncStatus("Loading your private cloud data…");
    await checkCloud(uid,attempt);
    if(!hasLocal&&app.getGuestState().prs.length){
      syncStatus($("cloudSyncStatus").textContent+" You also have guest PRs on this device; use Import device PRs to copy them.")
    }
  }
  async function authAction(kind){
    if(!auth||working)return;
    const email=$("cloudEmailInput").value.trim();
    const password=$("cloudPasswordInput").value;
    if(!email){error("Enter an email address.");return}
    if(kind!=="reset"&&password.length<8){error("Use at least 8 characters for the password.");return}
    error("");working=true;
    try{
      if(kind==="signup")await A.createUserWithEmailAndPassword(auth,email,password);
      else if(kind==="signin")await A.signInWithEmailAndPassword(auth,email,password);
      else{await A.sendPasswordResetEmail(auth,email);status("If the address is registered, check its inbox for a reset email.")}
      $("cloudPasswordInput").value=""
    }catch(e){error(handleError(e))}
    finally{working=false}
  }
  function importGuest(){
    if(!currentUser||!ready||conflict){error("Resolve your cloud account connection before importing.");return}
    const guest=app.getGuestState();
    if(!guest.prs.length){error("There are no guest PRs to import.");return}
    if(!window.confirm("Copy "+guest.prs.length+" guest PR entries into this account? The original device records will not be deleted."))return;
    const account=snapshotData(),records=[...account.prs],used=new Map(records.map(x=>[String(x.id),x]));
    let added=0,newId=Math.max(Date.now(),...records.map(x=>Number(x.id)||0));
    for(const r of guest.prs){
      const matching=used.get(String(r.id));
      if(matching&&JSON.stringify(matching)===JSON.stringify(r))continue;
      const entry={...r};
      if(matching){entry.id=++newId}
      records.push(entry);used.set(String(entry.id),entry);added++
    }
    const importingIntoEmpty=account.prs.length===0;
    const updated={preferredUnit:importingIntoEmpty?guest.preferredUnit:account.preferredUnit,
      inventory:importingIntoEmpty?guest.inventory:account.inventory,prs:records};
    try{ensureSize(updated)}catch(e){error("Too many PRs for the free cloud document. Export a backup first.");return}
    app.applyCloudData(updated);
    markDirty();
    syncStatus(added+" guest PR entries copied. Sync pending; originals still on the device.")
  }
  async function start(){
    if(!app){status("Sign-in could not start. Reload when connected to the internet.");return}
    if(!configured){
      status("Sign-in is temporarily unavailable. Please contact the app owner.");
      return
    }
    status("Connecting to cloud services…");
    try{
      const url="https://www.gstatic.com/firebasejs/13.4.0/";
      [A,F]=await Promise.all([import(url+"firebase-auth.js"),import(url+"firebase-firestore.js")]);
      const firebase=await import(url+"firebase-app.js");
      const fb=firebase.initializeApp(config);
      auth=A.getAuth(fb);db=F.getFirestore(fb);
      if(A.setPersistence&&A.browserLocalPersistence)await A.setPersistence(auth,A.browserLocalPersistence);
      $("cloudSignUp").onclick=()=>authAction("signup");
      $("cloudSignIn").onclick=()=>authAction("signin");
      $("cloudReset").onclick=()=>authAction("reset");
      $("cloudGoogleSignIn").onclick=()=>googleAction("signin");
      $("cloudLinkGoogle").onclick=()=>googleAction("link");
      $("cloudSyncNow").onclick=()=>syncNow();
      $("cloudUseCloud").onclick=acceptCloud;
      $("cloudKeepDevice").onclick=keepDevice;
      $("cloudImportDevice").onclick=importGuest;
      $("cloudSignOut").onclick=async()=>{
        clearTimeout(syncTimer);
        lockApp();
        try{await A.signOut(auth)}
        catch(e){
          error(handleError(e));
          if(auth.currentUser)handleUser(auth.currentUser)
        }
      };
      window.addEventListener("hforge:data-changed",e=>{if(e.detail?.uid===currentUser?.uid)markDirty()});
      window.addEventListener("online",()=>{if(currentUser){if(ready){const meta=readMeta(currentUser.uid);if(meta.dirty)syncNow();else checkCloud(currentUser.uid,session)}else checkCloud(currentUser.uid,session)}});
      A.onAuthStateChanged(auth,handleUser,e=>error(handleError(e)))
    }catch(e){lockApp();status("Sign-in is unavailable right now. Check your connection and reload.");error(handleError(e))}
  }
  start()
})();
