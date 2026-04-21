import webStoreUpload from "chrome-webstore-upload";

const store = webStoreUpload({
  extensionId: process.env.EXTENSION_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  refreshToken: process.env.REFRESH_TOKEN,
});

const brief = (obj) => ({
  id: obj.id,
  uploadState: obj.uploadState,
  crxVersion: obj.crxVersion,
  publishStatus: obj.publishStatus ?? obj.status,
  itemError: obj.itemError,
});

try {
  const pub = await store.get("PUBLISHED");
  console.log("PUBLISHED:", JSON.stringify(brief(pub)));
} catch (e) {
  console.log("PUBLISHED error:", e.message);
}

try {
  const draft = await store.get("DRAFT");
  console.log("DRAFT:", JSON.stringify(brief(draft)));
} catch (e) {
  console.log("DRAFT error:", e.message);
}
