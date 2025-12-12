# PDF to Excel Converter

A powerful application that converts PDF documents into structured Excel files automatically using AI-powered text extraction.

## Features

-  **Multiple PDF Support**: Convert multiple PDF files at once
-  **AI-Powered Extraction**: Uses OpenAI GPT-4 to intelligently extract and structure data
-  **Excel Export**: Automatically generates properly formatted Excel spreadsheets
-  **Fast Processing**: Handles large documents efficiently
-  **Auto Download**: Converted files download automatically

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key

### Setup Steps

1. **Clone the repository**

```bash
git clone https://github.com/PremnathSundarrajan/Convert_PDF_to_EXCEL.git
cd Convert_PDF_to_EXCEL
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure Environment Variables**
   Create a `.env` file in the project root directory:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

4. **Start the server**

```bash
node index.js
```

The server will start on `http://localhost:3000` (or the port specified in your .env file)

## How It Works

### PDF to Excel Conversion Process

1. **PDF Upload**: User uploads one or more PDF files through the web interface
2. **Text Extraction**: The application extracts text content from the PDF
3. **AI Processing**: OpenAI GPT-4o-mini analyzes the text and converts it to structured JSON format with predefined column names:
   - `pcs` (pieces)
   - `item` (item description)
   - `material` (material type)
   - `length`, `width`, `thick` (dimensions)
   - `m3` (cubic meters)
4. **Data Sanitization**: Cleans and validates the JSON response
5. **Excel Generation**: Converts the structured data into an Excel workbook
6. **Auto Download**: The Excel file automatically downloads to your device

## Usage

### Web Interface

1. **Open the Application**

   - Navigate to `https://convert-pdf-to-excel-frontend-plfz.vercel.app` in your web browser

2. **Select PDF Files**

   - Click on "Select PDF Files" button or drag and drop PDF files
   - You can select multiple PDF files at once
   - Supported format: PDF files with text content

3. **Convert to Excel**

   - Click the "Convert to Excel" button
   - Wait for processing (may take a few seconds depending on file size)
   - The conversion process includes:
     - Extracting text from PDF
     - Processing with AI to structure data
     - Generating Excel file
     - Automatic download

4. **Download Results**
   - The Excel file will automatically download when conversion is complete
   - File name will contain the original PDF name(s)
   - Check your Downloads folder for the converted file

### Step-by-Step Usage Guide

**Step 1: Upload PDF Files**

```
1. Open the application in your browser
2. Look for "Select PDF Files" button
3. Click to browse your computer or drag & drop PDF files
4. You can select multiple PDFs at once
```

**Step 2: Convert to Excel**

```
1. Click the "Convert to Excel" button
2. You'll see a loading indicator
3. Wait for processing (typically 5-30 seconds)
```

**Step 3: Download**

```
1. After processing completes, your Excel file downloads automatically
2. The file will be named based on your PDFs
3. Open the file in Excel to view your converted data
```

### API Endpoint

**POST** `/convert`

**Request:**

```
Content-Type: multipart/form-data
Body: pdfs (file array)
```

**Response:**

```json
{
  "success": true,
  "file": "converted.xlsx"
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Error description",
  "errors": [...]
}
```

## Technology Stack

- **Backend**: Node.js + Express
- **PDF Processing**: pdf-parse
- **AI Service**: OpenAI API (GPT-4o-mini)
- **Excel Generation**: XLSX (SheetJS)
- **File Upload**: Multer
- **Environment**: Dotenv
- **Frontend**: React + Vite

## Error Handling

Common errors and solutions:

| Error                                         | Cause                            | Solution                                    |
| --------------------------------------------- | -------------------------------- | ------------------------------------------- |
| `OPENAI_API_KEY is missing`                   | API key not configured           | Add OPENAI_API_KEY to .env file             |
| `No files uploaded`                           | Empty file selection             | Select at least one PDF file                |
| `Could not extract valid JSON`                | PDF not readable or wrong format | Ensure PDF contains text, not just images   |
| `Failed to extract valid JSON from all files` | Multiple file failures           | Check individual PDF files for text content |

## File Structure

```
Convert_PDF_to_EXCEL/
├── index.js                      # Main server file
├── controller/
│   └── convert.js               # Conversion logic controller
├── utils/
│   ├── extractJsonFromPDF.js     # AI text extraction
│   ├── sanitizeAIResponse.js     # Response cleaning
│   ├── flattenObject.js          # Data flattening
│   ├── tryFixJson.js             # JSON repair
│   └── unwindAndFlatten.js       # Data unwinding
├── uploads/                      # Temporary upload directory
├── package.json
└── README.md
```

## Important Notes

- **Temporary Files**: Uploaded PDF files are temporarily stored and automatically deleted after processing
- **Processing Time**: Depends on PDF size and complexity (typically 5-30 seconds)
- **Large Batches**: Processing multiple large PDFs may take longer
- **PDF Requirements**: PDFs must contain selectable text (not just scanned images)
- **Automatic Cleanup**: Uploaded files are removed after conversion completes
- **Browser Compatibility**: Works with all modern browsers

## Troubleshooting

### Files not uploading?

- Ensure you're using a modern browser
- Check that file size is reasonable (< 50MB recommended)
- Try refreshing the page

### Conversion taking too long?

- Large PDFs may take longer to process
- Check your internet connection
- Verify OpenAI API is working correctly

### Excel file not downloading?

- Check your browser's pop-up blocker settings
- Ensure downloads folder has sufficient space
- Try a different browser

### Data extraction errors?

- Ensure PDF contains text, not just images
- Try converting a smaller PDF first
- Check that PDF is not password-protected

## Support

For issues or questions:

1. Check the error details provided by the application
2. Review the server logs
3. Verify your OpenAI API key is valid
4. Check that all dependencies are installed correctly

