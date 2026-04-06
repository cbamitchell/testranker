import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ListEditor from './pages/ListEditor'
import RankingSession from './pages/RankingSession'
import Results from './pages/Results'
import Analytics from './pages/Analytics'
import Layout from './components/Layout'

export default function App() {
  return (
    <BrowserRouter basename="/testranker">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="list/new" element={<ListEditor />} />
          <Route path="list/:listId/edit" element={<ListEditor />} />
          <Route path="list/:listId/rank" element={<RankingSession />} />
          <Route path="list/:listId/results" element={<Results />} />
          <Route path="list/:listId/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
