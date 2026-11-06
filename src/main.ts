import { MemeTowerGame } from './game/MemeTowerGame';
import { t } from './i18n';
import { initTelegram } from './telegram';
import './styles.css';

document.documentElement.lang = t('app.language');
document.title = t('app.title');
document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));

initTelegram();
void MemeTowerGame.boot(document.getElementById('app')!, document.getElementById('hud')!);
