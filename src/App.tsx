import { useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon, type IconName } from './components/Icon';
import { PageHeader, UIProvider } from './components/ui';
import { ensureDefaultTopics } from './db/repo';
import { requestPersistence } from './lib/storage';
import Backup from './pages/Backup';
import BookDetail from './pages/BookDetail';
import BookForm from './pages/BookForm';
import Capture from './pages/Capture';
import CardDetail from './pages/CardDetail';
import CardForm from './pages/CardForm';
import ChapterClose from './pages/ChapterClose';
import Cards from './pages/Cards';
import Home from './pages/Home';
import FlashcardForm from './pages/FlashcardForm';
import Library from './pages/Library';
import Mastery from './pages/Mastery';
import MasteryReview from './pages/MasteryReview';
import PhotoCapture from './pages/PhotoCapture';
import Review from './pages/Review';
import Settings from './pages/Settings';
import ThemedReview from './pages/ThemedReview';
import Topics from './pages/Topics';

const TABS: { to: string; icon: IconName; label: string; className?: string }[] = [
  { to: '/', icon: 'home', label: 'Inicio' },
  { to: '/biblioteca', icon: 'book', label: 'Biblioteca' },
  { to: '/capturar', icon: 'plus', label: 'Capturar', className: 'capture' },
  { to: '/fichas', icon: 'cards', label: 'Fichas' },
  { to: '/repaso', icon: 'review', label: 'Repaso' },
];

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Principal">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={t.className}>
          {t.className === 'capture' ? (
            <span className="plus">
              <Icon name={t.icon} size={24} />
            </span>
          ) : (
            <Icon name={t.icon} />
          )}
          <span className="label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status">
      Hay una versión nueva.
      <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
      <button className="btn small ghost" style={{ color: 'inherit' }} onClick={() => setNeedRefresh(false)}>
        Luego
      </button>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="page">
      <PageHeader title={title} back />
      <p className="muted">Disponible en la próxima etapa.</p>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    requestPersistence();
    ensureDefaultTopics();
  }, []);

  return (
    <HashRouter>
      <UIProvider>
        <ScrollToTop />
        <UpdatePrompt />
        <div className="app">
          <TabBar />
          <main className="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/biblioteca" element={<Library />} />
              <Route path="/libro/nuevo" element={<BookForm />} />
              <Route path="/libro/:id" element={<BookDetail />} />
              <Route path="/libro/:id/editar" element={<BookForm />} />
              <Route path="/capturar" element={<Capture />} />
              <Route path="/subrayado/:id" element={<Capture />} />
              <Route path="/fichas" element={<Cards />} />
              <Route path="/ficha/nueva" element={<CardForm />} />
              <Route path="/ficha/:id" element={<CardDetail />} />
              <Route path="/ficha/:id/editar" element={<CardForm />} />
              <Route path="/temas" element={<Topics />} />
              <Route path="/repaso" element={<Review />} />
              <Route path="/ajustes" element={<Settings />} />
              <Route path="/respaldo" element={<Backup />} />
              <Route path="/capturar/foto" element={<PhotoCapture />} />
              <Route path="/cierre" element={<ChapterClose />} />
              <Route path="/repasos" element={<ThemedReview />} />
              <Route path="/maestria" element={<Mastery />} />
              <Route path="/maestria/repaso" element={<MasteryReview />} />
              <Route path="/maestria/nueva" element={<FlashcardForm />} />
              <Route path="/maestria/:id" element={<FlashcardForm />} />
              <Route path="/practica/*" element={<ComingSoon title="Idea de la semana" />} />
              <Route path="/diario" element={<ComingSoon title="Diario" />} />
              <Route path="/buscar" element={<ComingSoon title="Buscar" />} />
              <Route path="*" element={<ComingSoon title="No encontrado" />} />
            </Routes>
          </main>
        </div>
      </UIProvider>
    </HashRouter>
  );
}
