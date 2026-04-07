import React, { useState } from "react";
import DataGrid from "react-data-grid";
import * as XLSX from "xlsx";
import { Button, Card, Flex, Text, Box } from "@kushagradhawan/kookie-ui";

function App() {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [showRightPanel, setShowRightPanel] = useState(false);

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
        resizable: true,
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
    <Box css={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* MAIN GRID AREA */}
      <Box css={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        {/* HEADER + UPLOAD */}
        <Flex justify="between" align="center" css={{ padding: "20px", zIndex: 1 }}>
          <Text size="4" weight="bold">Excel Viewer</Text>
          <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
        </Flex>

        {/* GRID */}
        <Box css={{ flex: 1, padding: "20px", minHeight: 0 }}>
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={setRows}
            style={{ height: "100%" }}
          />
        </Box>
      </Box>

      {/* RIGHT PANEL */}
      {showRightPanel && (
        <Box
          css={{
            width: "300px",
            background: "#fff",
            borderLeft: "1px solid #e0e0e0",
            height: "100%",
            position: "fixed",
            right: 0,
            top: 0,
            padding: "20px",
            boxShadow: "-2px 0px 10px rgba(0,0,0,0.15)",
            zIndex: 10,
            overflowY: "auto",
          }}
        >
          <Card variant="surface" size="3">
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">Panel Content</Text>
              <Text size="2">You can put anything here.</Text>
              <Button onClick={() => setShowRightPanel(false)} size="2">Close</Button>
            </Flex>
          </Card>
        </Box>
      )}

      {/* BUTTON BOTTOM-RIGHT */}
      <Box
        css={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 20,
        }}
      >
        <Button size="3" onClick={() => setShowRightPanel(true)}>Open Panel</Button>
      </Box>
    </Box>
  );
}

export default App;
