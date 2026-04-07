import { useState } from 'react'
import DataGrid from 'react-data-grid'

function Spreadsheet() {
  const [columns] = useState([
    { key: 'id', name: 'ID', width: 80 },
    { key: 'name', name: 'Name', resizable: true, sortable: true },
    { key: 'value', name: 'Value', resizable: true, editable: true },
    { key: 'status', name: 'Status', resizable: true }
  ])

  const [rows] = useState([
    { id: 1, name: 'Item A', value: 100, status: 'Active' },
    { id: 2, name: 'Item B', value: 200, status: 'Pending' },
    { id: 3, name: 'Item C', value: 300, status: 'Done' }
  ])

  return (
    <div className="spreadsheet-wrapper">
      <DataGrid 
        columns={columns} 
        rows={rows} 
        className="rdg-light"
      />
    </div>
  )
}

export default Spreadsheet
