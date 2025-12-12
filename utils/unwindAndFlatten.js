

const dotenv = require("dotenv");
const flattenObject = require("./flattenObject");
dotenv.config();

function unwindAndFlatten(record, arrayKey = "material_details") {
  const records = [];
  const arrayToUnwind = record[arrayKey] || [];
  const baseRecord = { ...record };
  delete baseRecord[arrayKey];

  if (arrayToUnwind.length > 0) {
    arrayToUnwind.forEach((item, index) => {
      let unwoundRecord = { ...baseRecord };

      if (typeof item === "object" && item !== null) {
        unwoundRecord = { ...unwoundRecord, ...item };
      } else {
        unwoundRecord[`${arrayKey}_value_${index}`] = item;
      }
      records.push(unwoundRecord);
    });
  } else {
    records.push(baseRecord);
  }

  return records.flatMap((r) => {
    if (r.rows && Array.isArray(r.rows)) {
      return r.rows
        .map((row) => {
          const flatRow = { ...r };
          delete flatRow.rows;

          if (row.data && Array.isArray(row.data)) {
            row.data.forEach((cell, i) => {
              flatRow[`col_${i + 1}`] = cell;
            });
          }

          return { ...flatRow, ...row };
        })
        .map((row) => {
          delete row.data;
          return row;
        });
    }

    if (r.years && Array.isArray(r.years)) {
      return r.years.flatMap((yearData) => {
        return (yearData.data || []).map((item) => {
          const flatYear = { ...r };
          delete flatYear.years;
          return { ...flatYear, year: yearData.year, ...item };
        });
      });
    }

    return flattenObject(r);
  });
}

module.exports = unwindAndFlatten;
