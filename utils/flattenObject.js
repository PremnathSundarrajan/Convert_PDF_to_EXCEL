

const OpenAI = require("openai");
const XLSX = require("xlsx");
const dotenv = require("dotenv");
dotenv.config();


function flattenObject(obj, parentKey = "", res = {}) {
    if (obj === null || obj === undefined) {
        if (!parentKey) res["value"] = obj; 
        return res;
    }
    if (typeof obj !== "object" || obj instanceof Date) {
        res[parentKey || "value"] = obj;
        return res;
    }
    if (Array.isArray(obj)) {
        obj.forEach((item, idx) => {
            const newParent = parentKey ? `${parentKey}_${idx}` : `${idx}`;
            flattenObject(item, newParent, res);
        });
        return res;
    }
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}_${key}` : key;
        flattenObject(value, newKey, res);
    }
    return res;
}

module.exports = flattenObject;