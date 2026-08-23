export const firebaseConfig = {
  apiKey: "AIzaSyDUxAPbBWVMxtexFn44-dKMSgmPM8CQAJ8",
  authDomain: "todo-list-d0500.firebaseapp.com",
  projectId: "todo-list-d0500",
  storageBucket: "todo-list-d0500.firebasestorage.app",
  messagingSenderId: "219541712256",
  appId: "1:219541712256:web:f7d492517f970b4c602565"
};
 
// Don't touch below — used elsewhere to detect whether the config above
// has been filled in yet.
export const isConfigured = !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_'));
