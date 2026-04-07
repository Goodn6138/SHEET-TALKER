import { useMemo } from 'react'
import DataGrid from 'react-data-grid'

function Spreadsheet({ columns, rows, onRowsChange }) {
  // Ensure rows have IDs for react-data-grid
  const processedRows = useMemo(() => {
    return rows.map((row, idx) => ({
      ...row,
      id: row.id || idx + 1
    }))
  }, [rows])

  return (
    <div className="spreadsheet-wrapper">
      <DataGrid 
        columns={columns} 
        rows={processedRows}
        onRowsChange={onRowsChange}
        className="rdg-light"
        rowKeyGetter={(row) => row.id}
      />
    </div>
  )
}

export default Spreadsheet
