// firebase-init.js - Central Firebase configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
    getFirestore,
    collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc,
    query, where, orderBy, limit, serverTimestamp, onSnapshot, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import {
    getStorage,
    ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';

const firebaseConfig = {
    apiKey: "AIzaSyB4kQdzuZu-at1TtlN_db9HNTHre734mq0",
    authDomain: "donatelife-daf28.firebaseapp.com",
    projectId: "donatelife-daf28",
    storageBucket: "donatelife-daf28.firebasestorage.app",
    messagingSenderId: "544833489737",
    appId: "1:544833489737:web:4021902b192fe4bddce898",
    measurementId: "G-54ZVELBSGY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export {
    db, auth, storage, serverTimestamp,
    collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc,
    query, where, orderBy, limit, onSnapshot, writeBatch,
    ref, uploadBytes, getDownloadURL, deleteObject
};