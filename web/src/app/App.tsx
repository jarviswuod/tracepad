import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}