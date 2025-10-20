// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported  } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAHBOd5t6Mo01rKW267QBC23t1sARhn6Qk",
  authDomain: "talk2tables-475312.firebaseapp.com",
  projectId: "talk2tables-475312",
  storageBucket: "talk2tables-475312.firebasestorage.app",
  messagingSenderId: "213897794161",
  appId: "1:213897794161:web:ae4b70c6d2304e1f2ec1d0",
  measurementId: "G-76ZBJRHM4D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// const analytics = getAnalytics(app);

let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { app, auth, analytics };