cronAdd("fetch-lake-temperatures", "0 8,20 * * *", () => {
  const collectionName = "lake_temperatures";
  const hydroUrl = "https://hydrographie.ktn.gv.at/DE/repos/evoscripts/hydrografischer/getSeeWassertemperatur.es";
  const lakes = ["Wörthersee", "Faaker See"];
  const today = new Date().toISOString().slice(0, 10);

  const res = $http.send({
    url: hydroUrl,
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
    timeout: 30,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error("Hydrographie request failed: HTTP " + res.statusCode);
  }

  const items = Array.isArray(res.json) ? res.json : (res.json.data || []);
  const collection = $app.findCollectionByNameOrId(collectionName);

  for (let lake of lakes) {
    const entry = items.find((item) => item.gewasser === lake);

    if (!entry) {
      console.log("No lake data found for " + lake);
      continue;
    }

    const rawTemperature = String(entry.metrics2 || "0").replace(",", ".");
    const temperature = parseFloat(rawTemperature);

    if (isNaN(temperature)) {
      console.log("Invalid temperature for " + lake + ": " + rawTemperature);
      continue;
    }

    let record = null;

    try {
      record = $app.findFirstRecordByFilter(
        collectionName,
        "lake = {:lake} && recorded_date = {:recorded_date}",
        {
          lake: lake,
          recorded_date: today,
        }
      );
    } catch (_) {
      record = new Record(collection);
    }

    record.set("lake", lake);
    record.set("temperature", temperature);
    record.set("recorded_date", today);
    record.set("source", "hydrographie.ktn.gv.at");

    $app.save(record);

    console.log("Saved lake temperature: " + lake + " " + temperature + "C on " + today);
  }
});
