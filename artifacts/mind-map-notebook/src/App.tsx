import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation } from 'wouter';
import { Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { QueryClient } from '@tanstack/react-query';
import { NoteEditor } from './components/editor/NoteEditor';
import { basePath } from './lib/storage';
import { Home } from './pages/Home';
import { NotebookProvider } from './store/notebook-store';

const queryClient = new QueryClient();


export function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/note/:id" component={NoteEditor} />
    <Route component={NotFound} />
  </Switch>;
}

export function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export function App() {
  return <WouterRouter base={basePath}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoutedErrorBoundary>
          <NotebookProvider>
            <Router />
          </NotebookProvider>
        </RoutedErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </WouterRouter>;
}

export default App;
