import '@fontsource/russo-one/400.css'
import '@fontsource/exo-2/400.css'
import '@fontsource/exo-2/500.css'
import '@fontsource/exo-2/600.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App api={window.animedesk} />)
