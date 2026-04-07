import React, { useState } from "react";
import DataGrid from "react-data-grid";
import * as XLSX from "xlsx";

function App() {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);

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
        editable: true
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
    <div style={{ padding: 20 }}>
      <h2>Excel Viewer</h2>

      <input
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileUpload}
      />

      <div style={{ height: 500, marginTop: 20 }}>
        <DataGrid
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
        />
      </div>
    </div>
  );
}

export default App;
