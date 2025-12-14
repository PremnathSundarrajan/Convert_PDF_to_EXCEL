const resultsFunc = require("./utils/results");

async function run() {
  const req = {
    files: [
      {
        path: "./uploads/a632d88e554929ce7f42d619ef5a442c",
        originalname: "sample.pdf",
      },
    ],
  };

  try {
    const res = await resultsFunc(req);
    console.log("=== results ===");
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Error running resultsFunc:", e);
  }
}

run();
