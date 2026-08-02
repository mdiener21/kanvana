cronAdd("fetch-air-lake-temperatures", "0 */2 * * *", () => {
  const collectionName = "air_lake_temperatures";
  const hydroUrl = "https://hydrographie.ktn.gv.at/DE/repos/evoscripts/hydrografischer/getSeeWassertemperatur.es";
  const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=46.5923722&longitude=14.2705537&current=temperature_2m&timezone=Europe%2FVienna";
  const lakes = ["Wörthersee", "Faaker See"];
  const airName = "Viktring";
  const recordedDate = formatViennaTimestamp(new Date());

  const hydroRes = $http.send({
    url: hydroUrl,
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
    timeout: 30,
  });

  if (hydroRes.statusCode < 200 || hydroRes.statusCode >= 300) {
    throw new Error("Hydrographie request failed: HTTP " + hydroRes.statusCode);
  }

  const weatherRes = $http.send({
    url: weatherUrl,
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
    timeout: 30,
  });

  if (weatherRes.statusCode < 200 || weatherRes.statusCode >= 300) {
    throw new Error("Open-Meteo request failed: HTTP " + weatherRes.statusCode);
  }

  const items = Array.isArray(hydroRes.json) ? hydroRes.json : (hydroRes.json.data || []);
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
        "name = {:name} && recorded_date = {:recorded_date}",
        {
          name: lake,
          recorded_date: recordedDate,
        }
      );
    } catch (_) {
      record = new Record(collection);
    }

    record.set("name", lake);
    record.set("temperature", temperature);
    record.set("recorded_date", recordedDate);
    record.set("source", "hydrographie.ktn.gv.at");

    $app.save(record);

    console.log("Saved lake temperature: " + lake + " " + temperature + "C on " + recordedDate);
  }

  const airTemperature = parseFloat(weatherRes.json.current && weatherRes.json.current.temperature_2m);

  if (isNaN(airTemperature)) {
    throw new Error("Invalid air temperature from Open-Meteo response");
  }

  let airRecord = null;

  try {
    airRecord = $app.findFirstRecordByFilter(
      collectionName,
      "name = {:name} && recorded_date = {:recorded_date}",
      {
        name: airName,
        recorded_date: recordedDate,
      }
    );
  } catch (_) {
    airRecord = new Record(collection);
  }

  airRecord.set("name", airName);
  airRecord.set("temperature", airTemperature);
  airRecord.set("recorded_date", recordedDate);
  airRecord.set("source", "open-meteo");

  $app.save(airRecord);

  console.log("Saved air temperature: " + airTemperature + "C on " + recordedDate);
});

function formatViennaTimestamp(date) {
  const offsetMinutes = getViennaOffsetMinutes(date);
  const viennaTime = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);

  return [
    viennaTime.getUTCFullYear(),
    pad2(viennaTime.getUTCMonth() + 1),
    pad2(viennaTime.getUTCDate()),
  ].join("-") + "T" +
    [
      pad2(viennaTime.getUTCHours()),
      pad2(viennaTime.getUTCMinutes()),
      pad2(viennaTime.getUTCSeconds()),
    ].join(":") +
    sign +
    pad2(Math.floor(absOffset / 60)) +
    ":" +
    pad2(absOffset % 60);
}

function getViennaOffsetMinutes(date) {
  const year = date.getUTCFullYear();
  const dstStart = lastSundayUtc(year, 2, 1);
  const dstEnd = lastSundayUtc(year, 9, 1);

  return date >= dstStart && date < dstEnd ? 120 : 60;
}

function lastSundayUtc(year, month, hour) {
  const date = new Date(Date.UTC(year, month + 1, 0, hour, 0, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}
