const SHEET_NAME = "BETTYITAY_DATA";
const TOKEN = "CHANGE_ME_TO_SECRET_CODE";
const CHUNK_SIZE = 45000;

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || "{}");
    if (request.token !== TOKEN) {
      return json({ ok: false, error: "קוד סודי לא תקין" });
    }

    if (request.action === "save") {
      saveData(request.data, request.savedAt);
      return json({ ok: true, updatedAt: request.savedAt || new Date().toISOString() });
    }

    if (request.action === "load") {
      return json(loadData());
    }

    return json({ ok: false, error: "פעולה לא מוכרת" });
  } catch (error) {
    return json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet() {
  return json({ ok: true, message: "BETTYITAY Google Sheets API is running" });
}

function saveData(data, savedAt) {
  const sheet = getSheet();
  const text = JSON.stringify(data);
  const rows = [["savedAt", "version", "part", "json"]];
  for (let index = 0; index < text.length; index += CHUNK_SIZE) {
    rows.push([savedAt || new Date().toISOString(), "1", rows.length, text.slice(index, index + CHUNK_SIZE)]);
  }
  sheet.clear();
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  sheet.autoResizeColumns(1, 4);
}

function loadData() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2 || !values[1][3]) {
    return { ok: true, data: null, updatedAt: null };
  }
  const jsonText = values.slice(1).map((row) => row[3]).join("");
  return {
    ok: true,
    updatedAt: values[1][0],
    data: JSON.parse(jsonText),
  };
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
