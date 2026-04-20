// firebase-init.js — shared Firebase initialization for DonateLife
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getFirestore }   from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { getStorage }     from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';

const firebaseConfig = {
    apiKey:            "AIzaSyB4kQdzuZu-at1TtlN_db9HNTHre734mq0",
    authDomain:        "donatelife-daf28.firebaseapp.com",
    projectId:         "donatelife-daf28",
    storageBucket:     "donatelife-daf28.firebasestorage.app",
    messagingSenderId: "544833489737",
    appId:             "1:544833489737:web:4021902b192fe4bddce898",
    measurementId:     "G-54ZVELBSGY"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
