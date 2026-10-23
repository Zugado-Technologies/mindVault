import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAyes0ttsV3YEcaRWaA1Lv5gUciMAyrfCU",
    authDomain: "ztech-mindvault.firebaseapp.com",
    projectId: "ztech-mindvault",
    storageBucket: "ztech-mindvault.firebasestorage.app",
    messagingSenderId: "182054852031",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:182054852031:web:aad0024b365ac02276bd0a",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export default app;
