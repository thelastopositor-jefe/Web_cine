
 // src/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "firebase/auth";

import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Configuración oficial de Firebase - TuRodaje
const firebaseConfig = {
  apiKey: "AIzaSyB4jl_V2VGEWcmn-pvbptSQZWoHdSJsdmo",
  authDomain: "webcine-e2af5.firebaseapp.com",
  projectId: "webcine-e2af5",
  storageBucket: "webcine-e2af5.firebasestorage.app",
  messagingSenderId: "573411732113",
  appId: "1:573411732113:web:b305cb22cf0fdfae15ed30"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Firebase Authentication
export const auth = getAuth(app);

// Proveedor de Google
export const googleProvider = new GoogleAuthProvider();

// Permitir seleccionar la cuenta de Google
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Firestore
export const db = getFirestore(app);

// Storage
export const storage = getStorage(app);

// Cloud Functions
export const functions = getFunctions(app, "europe-west1");

// Métodos de autenticación
export {
  signInWithPopup,
  signOut
};
