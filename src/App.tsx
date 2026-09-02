import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Frameworks from '@/pages/Frameworks'
import AuditWorkflow from '@/pages/AuditWorkflow'
import Interviews from '@/pages/Interviews'
import Findings from '@/pages/Findings'
import Reports from '@/pages/Reports'
import Glossary from '@/pages/Glossary'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="frameworks" element={<Frameworks />} />
        <Route path="audit/:frameworkId" element={<AuditWorkflow />} />
        <Route path="interviews" element={<Interviews />} />
        <Route path="findings" element={<Findings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="glossary" element={<Glossary />} />
      </Route>
    </Routes>
  )
}
