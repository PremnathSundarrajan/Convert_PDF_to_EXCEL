const dotenv = require("dotenv");
const flattenObject = require("./flattenObject");
dotenv.config();

function unwindAndFlatten(record, arrayKey = "material_details") {
  const records = [];
  const arrayToUnwind = record[arrayKey] || [];
  const baseRecord = { ...record };
  delete baseRecord[arrayKey];

  // Preserve order and client fields at the top level if they exist
  const orderClientData = {};
  if (record.order !== undefined) {
    orderClientData.order = record.order;
  }
  if (record.client !== undefined) {
    orderClientData.client = record.client;
  }

  if (arrayToUnwind.length > 0) {
    arrayToUnwind.forEach((item, index) => {
      let unwoundRecord = { ...baseRecord };

      if (typeof item === "object" && item !== null) {
        // Spread the item which already contains order and client from results.js
        unwoundRecord = { ...unwoundRecord, ...item };
      } else {
        unwoundRecord[`${arrayKey}_value_${index}`] = item;
      }

      // Ensure order and client are included
      unwoundRecord = { ...orderClientData, ...unwoundRecord };

      records.push(unwoundRecord);
    });
  } else {
    records.push({ ...baseRecord, ...orderClientData });
  }

  return records.flatMap((r) => {
    if (r.rows && Array.isArray(r.rows)) {
      const orderClient = {
        order: r.order,
        client: r.client,
      };

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
          return { ...orderClient, ...row };
        });
    }

    if (r.years && Array.isArray(r.years)) {
      const orderClient = {
        order: r.order,
        client: r.client,
      };

      return r.years.flatMap((yearData) => {
        return (yearData.data || []).map((item) => {
          const flatYear = { ...r };
          delete flatYear.years;
          return { ...orderClient, ...flatYear, year: yearData.year, ...item };
        });
      });
    }

    return flattenObject(r);
  });
}

module.exports = unwindAndFlatten;
