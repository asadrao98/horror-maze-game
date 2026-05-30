import './firebase.js'; // side-effect: init Firebase + Analytics
import { Game } from './Game.js';

const game = new Game();
game.init();

window.addEventListener('beforeunload', () => game.dispose());
