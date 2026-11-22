import './styles/fonts.css';
import './styles/index.css';
import './styles/tokens.css';
import './styles/glass.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter([{path:'*',element:<AuthProvider><App /></AuthProvider>}])}/>
  </StrictMode>,
);
