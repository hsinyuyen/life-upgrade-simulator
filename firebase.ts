import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBQ6qNuK3wnD8tM-YincYL_3OIqrGsvIw",
  authDomain: "morph-lister.firebaseapp.com",
  projectId: "morph-lister",
  storageBucket: "morph-lister.firebasestorage.app",
  messagingSenderId: "943807114477",
  appId: "1:943807114477:web:8b3d4588debf90a76330e4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);