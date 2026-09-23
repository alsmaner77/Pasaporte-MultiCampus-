import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBvZnYnTt3bPomKyTCkmO5ofaMuqmYKloM",
    authDomain: "pasaporte-multicampus.firebaseapp.com",
    projectId: "pasaporte-multicampus",
    storageBucket: "pasaporte-multicampus.firebasestorage.app",
    messagingSenderId: "983073027756",
    appId: "1:983073027756:web:1188de6539a3f74c449109",
    measurementId: "G-PWW6HDP11B"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);