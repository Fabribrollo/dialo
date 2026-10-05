import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { API_URL } from './constants/api.js';

function Placeholder({ name }) {
  return <h1>{name}</h1>;
}

function HealthCheck() {
  const [status, setStatus] = useState('verificando…');

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('sin conexión con la API'));
  }, []);

  return <p>API: {status}</p>;
}

export default function App() {
  return (
    <>
      <HealthCheck />
      <Routes>
        <Route path="/login" element={<Placeholder name="Login" />} />
        <Route path="/register" element={<Placeholder name="Registro" />} />
        <Route path="/app" element={<Placeholder name="App" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
