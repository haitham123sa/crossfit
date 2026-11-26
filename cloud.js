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
  function handleError(err){
    const code=err&&err.code;
    const messages={
      "auth/invalid-credential":"Email or password is incorrect.",
      "auth/invalid-email":"Enter a valid email address.",
      "auth/email-already-in-use":"An account with this email already exists.",
      "auth/weak-password":"Choose a stronger password.",
      "auth/too-many-requests":"Too many attempts. Please try again later.",
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
      app.switchProfile(null);
      show("cloudAuthForm",true);show("cloudSignedIn",false);
      status("Sign in to save PRs privately in the cloud. Guest data stays on this device.");
      return
    }
    const uid=user.uid;
    const hasLocal=app.hasAccountCache(uid);
    app.switchProfile(uid);
    show("cloudAuthForm",false);show("cloudSignedIn",true);
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
    if(!app){status("Cloud module could not load; local mode remains available.");return}
    if(!configured){
      status("Cloud accounts are not connected yet. H-FORGE still saves PRs locally. The owner must connect a free Firebase Spark project.");
      return
    }
    status("Connecting to cloud services…");
    try{
      const url="https://www.gstatic.com/firebasejs/13.4.0/";
      [A,F]=await Promise.all([import(url+"firebase-auth.js"),import(url+"firebase-firestore.js")]);
      const firebase=await import(url+"firebase-app.js");
      const fb=firebase.initializeApp(config);
      auth=A.getAuth(fb);db=F.getFirestore(fb);
      $("cloudSignUp").onclick=()=>authAction("signup");
      $("cloudSignIn").onclick=()=>authAction("signin");
      $("cloudReset").onclick=()=>authAction("reset");
      $("cloudSyncNow").onclick=()=>syncNow();
      $("cloudUseCloud").onclick=acceptCloud;
      $("cloudKeepDevice").onclick=keepDevice;
      $("cloudImportDevice").onclick=importGuest;
      $("cloudSignOut").onclick=async()=>{clearTimeout(syncTimer);try{await A.signOut(auth)}catch(e){error(handleError(e))}};
      window.addEventListener("hforge:data-changed",e=>{if(e.detail?.uid===currentUser?.uid)markDirty()});
      window.addEventListener("online",()=>{if(currentUser){if(ready){const meta=readMeta(currentUser.uid);if(meta.dirty)syncNow();else checkCloud(currentUser.uid,session)}else checkCloud(currentUser.uid,session)}});
      A.onAuthStateChanged(auth,handleUser,e=>error(handleError(e)))
    }catch(e){status("Cloud services couldn't start. Your device data still works offline.");error(handleError(e))}
  }
  start()
})();
