const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "l-eau-4566d",
    clientEmail: "firebase-adminsdk-fbsvc@l-eau-4566d.iam.gserviceaccount.com",
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: "https://l-eau-4566d-default-rtdb.firebaseio.com",
});

const db = admin.database();
console.log("IA surveillance eau demarree...");

db.ref("projet_iot/donnees_actuelles/valeur_ph").on("value", async (snapshot) => {
  const ph = snapshot.val();
  if (ph === null) return;
  console.log(`Nouveau pH recu: ${ph}`);
  const result = fuzzyPH(ph);

  await db.ref("projet_iot/ia/analyse").set({
    ph: { valeur: ph, decision: result.decision, action: result.action, dose: result.dose, alerte: result.alerte },
    chlore: { valeur: 0.6, decision: "Normal", action: "Aucune action", dose: 0, alerte: false },
    cond:   { valeur: 500.0, decision: "Normal", action: "Aucune action", dose: 0, alerte: false },
    timestamp: Date.now(),
  });

  await db.ref("projet_iot/correction").set({
    statut:   result.alerte ? "anomalie_detectee" : "normal",
    decision: result.decision,
    action:   result.action,
    avant:    ph,
    succes:   !result.alerte,
  });

  if (result.alerte) {
    await db.ref("projet_iot/alertes").push({
      type: "pH", valeur: ph, decision: result.decision,
      action: result.action, timestamp: Date.now(),
    });
  }
  console.log(`IA: ${result.decision} | dose: ${result.dose}`);
});

function fuzzyPH(ph) {
  const d_ta = ph <= 5.5 ? 1.0 : ph >= 6.5 ? 0.0 : (6.5 - ph);
  const d_a  = (ph <= 5.5 || ph >= 7.0) ? 0.0 : ph <= 6.25 ? (ph-5.5)/0.75 : (7.0-ph)/0.75;
  const d_n  = (ph <= 6.5 || ph >= 8.5) ? 0.0 : ph <= 7.5  ? (ph-6.5) : (8.5-ph);
  const d_b  = (ph <= 7.0 || ph >= 9.0) ? 0.0 : ph <= 8.0  ? (ph-7.0) : (9.0-ph);
  const d_tb = ph >= 8.5 ? 1.0 : ph <= 7.5 ? 0.0 : (ph-7.5);
  const dose_base  = Math.max(d_ta * 1.0, d_a * 0.5);
  const dose_acide = Math.max(d_tb * 1.0, d_b * 0.5);
  if (d_n >= 0.7) return { decision: "Normal", action: "Aucune action", dose: 0, alerte: false };
  if (dose_base > dose_acide) return {
    decision: d_ta > 0.5 ? "Tres acide - correction urgente" : "Acide - correction douce",
    action: "Pompe base necessaire", dose: dose_base, alerte: true,
  };
  return {
    decision: d_tb > 0.5 ? "Tres basique - correction urgente" : "Basique - correction douce",
    action: "Pompe acide necessaire", dose: dose_acide, alerte: true,
  };
}
