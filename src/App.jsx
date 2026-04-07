import React, { useState } from "react";
import DataGrid from "react-data-grid";
import * as XLSX from "xlsx";

function App() {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [showLeftPanel, setShowLeftPanel] = useState(false);

  // Handle Excel Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (!jsonData.length) return;

      const headers = jsonData[0];

      const cols = headers.map((header, i) => ({
        key: `col_${i}`,
        name: header || `Column ${i + 1}`,
        editable: true,
        resizable: true // 🔥 adjustable columns
      }));

      const formattedRows = jsonData.slice(1).map((row, i) => {
        const obj = { id: i };
        row.forEach((cell, j) => {
          obj[`col_${j}`] = cell;
        });
        return obj;
      });

      setColumns(cols);
      setRows(formattedRows);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* LEFT PANEL */}
      {showLeftPanel && (
        <div
          style={{
            width: "250px",
            background: "#111",
            color: "#fff",
            padding: "20px",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <h3>Left Panel</h3>
          <p>This spans full height</p>

          <button onClick={() => setShowLeftPanel(false)}>
            Close
          </button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column" }}>
        
        <h2>Excel Viewer</h2>

        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
        />

        {/* GRID */}
        <div style={{ flex: 1, marginTop: 20 }}>
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={setRows}
            style={{ height: "100%" }} // 🔥 full height grid
          />
        </div>

        {/* BOTTOM BUTTON */}
        <button
          style={{
            marginTop: 10,
            padding: "10px",
            background: "#007bff",
            color: "white",
            border: "none",
            cursor: "pointer"
          }}
          onClick={() => setShowLeftPanel(true)}
        >
          Open Left Panel
        </button>

      </div>
    </div>
  );
}

export default App;
