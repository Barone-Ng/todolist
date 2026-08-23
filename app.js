import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

if(!isConfigured){
  document.getElementById('configBanner').classList.add('show');
}

let db = null;
if(isConfigured){
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

let currentPerson = null;
const today = new Date();
const dateKey = today.toISOString().slice(0,10);
const dateDisplay = today.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });

const DEFAULT_EXERCISES = ["20 squats","20 push-ups","1 min plank","10 min walk","Stretch 5 min"];

let unsubNotes = null;
let unsubEx = null;
let unsubExDone = null;
let unsubDaily = null;
let unsubDailyDone = null;
let notesCache = [];
let exCache = [];
let exDoneIds = [];
let dailyCache = [];
let dailyDoneIds = [];

function fmtDate(k){
  const d = new Date(k + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
}

// ---------- Landing ----------
document.querySelectorAll('.picker-card').forEach(card=>{
  function go(){ openDashboard(card.dataset.person); }
  card.addEventListener('click', go);
  card.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); go(); }});
});

document.getElementById('switchBtn').addEventListener('click', ()=>{
  if(unsubNotes) unsubNotes();
  if(unsubEx) unsubEx();
  if(unsubExDone) unsubExDone();
  if(unsubDaily) unsubDaily();
  if(unsubDailyDone) unsubDailyDone();
  show('landing');
});

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  // force an instant jump to the top of the new section, after layout settles
  requestAnimationFrame(()=>{
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

function openDashboard(person){
  currentPerson = person;
  document.getElementById('whoName').textContent = person;
  document.getElementById('dateTag').textContent = dateDisplay;
  document.getElementById('noteDateInput').value = dateKey;
  document.getElementById('noteDateInput').min = dateKey;
  show('dashboard');

  if(!isConfigured){
    document.getElementById('notesList').innerHTML = '<div class="empty-note">Connect Firebase to start saving tasks.</div>';
    document.getElementById('exList').innerHTML = '<div class="empty-note">Connect Firebase to start tracking exercises.</div>';
    document.getElementById('dailyList').innerHTML = '<div class="empty-note">Connect Firebase to start saving reminders.</div>';
    return;
  }

  if(unsubNotes) unsubNotes();
  if(unsubEx) unsubEx();
  if(unsubExDone) unsubExDone();
  if(unsubDaily) unsubDaily();
  if(unsubDailyDone) unsubDailyDone();

  const notesQ = query(collection(db, 'notes'), where('person','==', person));
  unsubNotes = onSnapshot(notesQ, snap=>{
    notesCache = snap.docs.map(d=>({ id: d.id, ...d.data() }));
    renderNotes();
    renderLater();
  }, err=> reportError('load tasks', err));

  const exQ = query(collection(db, 'exercises'), where('person','==', person));
  unsubEx = onSnapshot(exQ, async snap=>{
    exCache = snap.docs.map(d=>({ id: d.id, ...d.data() }));
    if(exCache.length === 0){
      try{
        for(const name of DEFAULT_EXERCISES){
          await addDoc(collection(db,'exercises'), { person, name, createdAt: Date.now() });
        }
      }catch(err){
        reportError('set up default exercises', err);
      }
      return; // snapshot will fire again with the new docs
    }
    renderExercises();
  }, err=> reportError('load exercises', err));

  const exDoneRef = doc(db, 'exerciseDone', `${person}_${dateKey}`);
  unsubExDone = onSnapshot(exDoneRef, snap=>{
    exDoneIds = snap.exists() ? (snap.data().ids || []) : [];
    renderExercises();
  }, err=> reportError('load exercise progress', err));

  const dailyQ = query(collection(db, 'dailyNotes'), where('person','==', person));
  unsubDaily = onSnapshot(dailyQ, snap=>{
    dailyCache = snap.docs.map(d=>({ id: d.id, ...d.data() }));
    renderDaily();
  }, err=> reportError('load daily reminders', err));

  const dailyDoneRef = doc(db, 'dailyNoteDone', `${person}_${dateKey}`);
  unsubDailyDone = onSnapshot(dailyDoneRef, snap=>{
    dailyDoneIds = snap.exists() ? (snap.data().ids || []) : [];
    renderDaily();
  }, err=> reportError('load daily reminder progress', err));
}

// ---------- Notes (today) ----------
function renderNotes(){
  const todays = notesCache.filter(n=>n.date === dateKey).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const container = document.getElementById('notesList');
  container.innerHTML = '';
  if(todays.length === 0){
    const p = document.createElement('div');
    p.className = 'empty-note';
    p.textContent = 'Nothing yet — add your first task for today.';
    container.appendChild(p);
  }
  todays.forEach(item=> container.appendChild(buildRow(item, 'note')));
  const doneCount = todays.filter(i=>i.done).length;
  document.getElementById('notesCount').textContent = todays.length ? `${doneCount}/${todays.length} done` : '';
}

document.getElementById('noteAddBtn').addEventListener('click', addNote);
document.getElementById('noteInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addNote(); });

async function addNote(){
  if(!isConfigured) return;
  const input = document.getElementById('noteInput');
  const dateInput = document.getElementById('noteDateInput');
  const text = input.value.trim();
  const targetDate = dateInput.value || dateKey;
  if(!text) return;
  try{
    await addDoc(collection(db,'notes'), {
      person: currentPerson, text, done:false, date: targetDate, createdAt: Date.now()
    });
    input.value = '';
    dateInput.value = dateKey;
  }catch(err){
    reportError('add task', err);
  }
}

async function toggleNote(id, done){
  try{ await updateDoc(doc(db,'notes', id), { done: !done }); }
  catch(err){ reportError('update task', err); }
}
async function deleteNote(id){
  try{ await deleteDoc(doc(db,'notes', id)); }
  catch(err){ reportError('delete task', err); }
}

// ---------- Scheduled for later ----------
function renderLater(){
  const upcoming = notesCache.filter(n=>n.date > dateKey).sort((a,b)=> a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const container = document.getElementById('laterList');
  const details = document.getElementById('laterDetails');
  container.innerHTML = '';
  if(upcoming.length === 0){
    container.innerHTML = '<div class="empty-note">Nothing scheduled ahead — add a task above with a future date.</div>';
    details.querySelector('summary').childNodes[0].textContent = 'Scheduled for later ';
    return;
  }
  details.querySelector('summary').childNodes[0].textContent = `Scheduled for later (${upcoming.length}) `;
  let lastGroup = null;
  upcoming.forEach(item=>{
    if(item.date !== lastGroup){
      lastGroup = item.date;
      const label = document.createElement('div');
      label.className = 'later-group-label';
      label.textContent = fmtDate(item.date);
      container.appendChild(label);
    }
    container.appendChild(buildRow(item, 'note'));
  });
}

// ---------- Daily reminders (persist until deleted, reset each day) ----------
function renderDaily(){
  const container = document.getElementById('dailyList');
  container.innerHTML = '';
  if(dailyCache.length === 0){
    container.innerHTML = '<div class="empty-note">No daily reminders yet — add one below.</div>';
  }
  dailyCache.forEach(item=>{
    container.appendChild(buildRow({ id:item.id, text:item.text, done: dailyDoneIds.includes(item.id) }, 'daily'));
  });
  const total = dailyCache.length;
  const doneCount = dailyCache.filter(i=>dailyDoneIds.includes(i.id)).length;
  document.getElementById('dailyCount').textContent = total ? `${doneCount}/${total} done` : '';
}

document.getElementById('dailyAddBtn').addEventListener('click', addDaily);
document.getElementById('dailyInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addDaily(); });

async function addDaily(){
  if(!isConfigured) return;
  const input = document.getElementById('dailyInput');
  const text = input.value.trim();
  if(!text) return;
  try{
    await addDoc(collection(db,'dailyNotes'), { person: currentPerson, text, createdAt: Date.now() });
    input.value = '';
  }catch(err){
    reportError('add daily reminder', err);
  }
}

async function toggleDaily(id){
  try{
    const refDoc = doc(db, 'dailyNoteDone', `${currentPerson}_${dateKey}`);
    const nextIds = dailyDoneIds.includes(id) ? dailyDoneIds.filter(x=>x!==id) : [...dailyDoneIds, id];
    await setDoc(refDoc, { person: currentPerson, date: dateKey, ids: nextIds }, { merge:true });
  }catch(err){
    reportError('update daily reminder', err);
  }
}

async function deleteDaily(id){
  try{
    await deleteDoc(doc(db,'dailyNotes', id));
    if(dailyDoneIds.includes(id)){
      const refDoc = doc(db, 'dailyNoteDone', `${currentPerson}_${dateKey}`);
      await setDoc(refDoc, { ids: dailyDoneIds.filter(x=>x!==id) }, { merge:true });
    }
  }catch(err){
    reportError('delete daily reminder', err);
  }
}

// ---------- Exercises ----------
function renderExercises(){
  const container = document.getElementById('exList');
  container.innerHTML = '';
  if(exCache.length === 0){
    container.innerHTML = '<div class="empty-note">No exercises yet — add one below.</div>';
  }
  exCache.forEach(item=>{
    container.appendChild(buildRow({ id:item.id, text:item.name, done: exDoneIds.includes(item.id) }, 'exercise'));
  });
  const total = exCache.length;
  const doneCount = exCache.filter(i=>exDoneIds.includes(i.id)).length;
  document.getElementById('exCount').textContent = total ? `${doneCount}/${total} done` : '';
  const pct = total ? Math.round((doneCount/total)*100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = pct + '%';
}

document.getElementById('exAddBtn').addEventListener('click', addExercise);
document.getElementById('exInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addExercise(); });

async function addExercise(){
  if(!isConfigured) return;
  const input = document.getElementById('exInput');
  const name = input.value.trim();
  if(!name) return;
  try{
    await addDoc(collection(db,'exercises'), { person: currentPerson, name, createdAt: Date.now() });
    input.value = '';
  }catch(err){
    reportError('add exercise', err);
  }
}

async function toggleExercise(id){
  try{
    const refDoc = doc(db, 'exerciseDone', `${currentPerson}_${dateKey}`);
    const nextIds = exDoneIds.includes(id) ? exDoneIds.filter(x=>x!==id) : [...exDoneIds, id];
    await setDoc(refDoc, { person: currentPerson, date: dateKey, ids: nextIds }, { merge:true });
  }catch(err){
    reportError('update exercise', err);
  }
}

async function deleteExercise(id){
  try{
    await deleteDoc(doc(db,'exercises', id));
    if(exDoneIds.includes(id)){
      const refDoc = doc(db, 'exerciseDone', `${currentPerson}_${dateKey}`);
      await setDoc(refDoc, { ids: exDoneIds.filter(x=>x!==id) }, { merge:true });
    }
  }catch(err){
    reportError('delete exercise', err);
  }
}

function reportError(action, err){
  console.error(`Failed to ${action}:`, err);
  const code = err && err.code ? err.code : 'unknown-error';
  let msg = `Couldn't ${action} (${code}).`;
  if(code === 'permission-denied'){
    msg += ' Your Firestore security rules are blocking writes — check them in the Firebase console.';
  } else if(code === 'unavailable' || code === 'failed-precondition'){
    msg += ' Firestore may not be enabled yet for this project.';
  }
  alert(msg);
}

// ---------- shared row builder ----------
function buildRow(item, kind){
  const row = document.createElement('div');
  row.className = 'item-row';

  const cb = document.createElement('button');
  cb.className = 'checkbox' + (item.done ? ' checked' : '');
  cb.setAttribute('aria-label', item.done ? 'Mark as not done' : 'Mark as done');
  cb.addEventListener('click', ()=>{
    if(kind==='note') toggleNote(item.id, item.done);
    else if(kind==='exercise') toggleExercise(item.id);
    else if(kind==='daily') toggleDaily(item.id);
  });

  const text = document.createElement('div');
  text.className = 'item-text' + (item.done ? ' done' : '');
  text.textContent = item.text;

  const del = document.createElement('button');
  del.className = 'item-del';
  del.setAttribute('aria-label','Remove');
  del.textContent = '×';
  del.addEventListener('click', ()=>{
    if(kind==='note') deleteNote(item.id);
    else if(kind==='exercise') deleteExercise(item.id);
    else if(kind==='daily') deleteDaily(item.id);
  });

  row.appendChild(cb);
  row.appendChild(text);
  row.appendChild(del);
  return row;
}
