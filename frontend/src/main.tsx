import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import "./index.css";
import { ControlsProvider } from "./state/controls";

const CockpitPage = lazy(() => import("./pages/CockpitPage").then((m) => ({ default: m.CockpitPage })));
const AccuracyPage = lazy(() => import("./pages/AccuracyPage").then((m) => ({ default: m.AccuracyPage })));
const DriftPage = lazy(() => import("./pages/DriftPage").then((m) => ({ default: m.DriftPage })));
const BufferPage = lazy(() => import("./pages/BufferPage").then((m) => ({ default: m.BufferPage })));
const ExplorerPage = lazy(() => import("./pages/ExplorerPage").then((m) => ({ default: m.ExplorerPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ControlsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<CockpitPage />} />
              <Route path="accuracy" element={<AccuracyPage />} />
              <Route path="drift" element={<DriftPage />} />
              <Route path="buffer" element={<BufferPage />} />
              <Route path="explorer" element={<ExplorerPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ControlsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
