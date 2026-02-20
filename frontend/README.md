
# Talk2Tables

Conversational AI Assistant for Complex SQL Database Interaction

## Running the code

Run `npm install --save-dev @types/react @types/react-dom` to install the dependencies.

Run `npm run dev` to start the development server.

## Create a firebase folder inside components  aand in that create a FirebaseApp.ts and omside that insert firebase creds and
```
Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// const analytics = getAnalytics(app);

let analytics: ReturnType<typeof getAnalytics> | null = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

//configurations

export { app, auth, analytics, db };
```
