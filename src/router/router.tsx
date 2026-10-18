import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppLayout } from "../pages/app";
import { StandaloneLayout } from "../pages/standalone";
import { pages, type PageEntry } from "./pages";

const DEFAULT_ROUTE = "/";

// Without this guard, "*" redirects to a page that doesn't exist, which matches "*" again, forever.
if (!pages.some((page) => page.path === DEFAULT_ROUTE)) {
  throw new Error(`Router: DEFAULT_ROUTE "${DEFAULT_ROUTE}" has no matching page.`);
}

const toRoute = (page: PageEntry): RouteObject => {
  const lazy: RouteObject["lazy"] = async () => ({
    Component: (await page.load()).default,
  });
  // A page at "/" becomes the layout's index route instead of a nested "/" path.
  return page.path === "/" ? { index: true, lazy } : { path: page.path, lazy };
};

const routesFor = (section: PageEntry["section"]): RouteObject[] =>
  pages.filter((page) => page.section === section).map(toRoute);

const appRoutes = routesFor("app");

// If no app page lives at "/", send "/" to the default route.
if (!appRoutes.some((route) => route.index)) {
  appRoutes.unshift({ index: true, element: <Navigate to={DEFAULT_ROUTE} replace /> });
}

export const RouterBrowser = createBrowserRouter([
  { path: "/", element: <AppLayout />, children: appRoutes },
  { element: <StandaloneLayout />, children: routesFor("standalone") },
  { path: "*", element: <Navigate to={DEFAULT_ROUTE} replace /> },
]);
