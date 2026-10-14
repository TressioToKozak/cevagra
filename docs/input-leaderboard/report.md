# Ranking i edycja imienia — raport

Zmiany: `game.js`, `styles.css`, nowy `editing-cursor.js`, `tests.mjs`,
`scripts/input-leaderboard-tests.cjs`; `index.html`, importy runtime i istniejące
browser tests używają cache v19. README i ten katalog dokumentują rezultat.

Ranking miał limit 312 px niezależny od wysokości modala. Usunięto go i zastosowano
Flex z naturalną wysokością krótkich list oraz ograniczeniem długich do viewportu.
Modal używa `fit-content`, tabela jest jedynym przewijanym obszarem. Nagłówki są
sticky; rozmiar viewportu tabeli dopasowuje się do pełnych wierszy przy otwarciu
oraz resize. Delikatny scroll snap wyrównuje wiersze po przewijaniu. Ostatni wpis
jest w pełni dostępny. Podium ma trzy subtelne kolory; wyróżnienie bieżącego gracza
jest obramowaniem komórek zamiast outline nachodzącego na sąsiadów. Opaque rows
osłaniają tekst od świątecznej dekoracji. Nagłówek dopasowano do dostępnej szerokości.
Ranking, zapis, daty, duplikaty imion i CSV nie zmieniły się.

Pole imienia miało `autofocus` i zmianę gradientowego tła na kolor przy focus,
co sprzyjało nagłej zmianie pierwszego stanu. Autofocus usunięto; tło i geometria
są stałe, zmieniają się tylko border/shadow. W testach pierwszy klik daje jeden
focus, bez blur, przesunięć i odtwarzania elementu. Caret ma kolor `#ffd779`.

Nie znaleziono reguły I-beam: pola miały już custom cursor. CSS nie pozwala
wymusić widoczności wskaźnika sprzętowego, gdy system/przeglądarka ukrywa go
podczas pisania; nie ma też standardowego API do wykrywania jego ukrycia.
Headless Chromium nie pozwala wiarygodnie potwierdzić konkretnego ustawienia OS.
Dlatego gwarancję widoczności podczas edycji zapewnia ograniczony fallback:
- tylko tekstowa edycja przy znanej rzeczywistej pozycji myszy;
- istniejące PNG clicker-hover/clicker-click 64×64, hotspot 18/5;
- native cursor:none wyłącznie gdy gotowy obraz overlay jest widoczny;
- pointer-events:none, bez przechwytywania kliknięć czy keydown preventDefault;
- obsługa granic viewportu, resize, opuszczenia okna, blur, ukrycia karty,
  submit i zamknięcia dialogu; w organizerze obraz jest w top layer dialogu;
- brak animacji, pętli RAF, zmiany OS settings czy dodatkowych assetów.

**Testy:** Node 122 672 sprawdzenia + rozkład 5000 seedów. Browser suites:
`input-leaderboard`, `browser`, `interaction`, `edge`, `background` przeszły.
Nowy test obejmuje 0/1/3/5/10/25/100 wpisów przy 1920×1080, 1366×768, 1280×720;
kompaktowe krótkie listy, pełne długie wiersze, sticky header, ostatni wpis,
zamykanie/reopen oraz wyróżnienie current. Rzeczywiste keyboard input sprawdza
pisanie, Backspace, edycję w środku, selekcję, wklejenie przez Clipboard API,
Tab, stabilny focus, ten sam DOM i bbox, widoczny overlay, caret-color,
wyłączenie po submit/blur i organizer. Dodatkowy rzeczywisty wheel test sprawdza
wyrównanie do pełnego wiersza. Pełne turnieje, perfect 1000, timeouty, preload,
retry/decode, lokalne wyniki, CSV i RESET także przeszły.

[Przed](before.jpg) · [Po](after.jpg) · [Krótki ranking](short-board.jpg)

[Pisanie: custom cursor i native caret](typing-cursor.jpg) · [Pierwszy focus](first-focus.jpg)

Pełne PNG: `/tmp/ceva-leaderboard-{count}-{width}.png`,
`/tmp/ceva-name-first-focus.png`, `/tmp/ceva-name-typing.png`.

Ograniczenia: przetestowano Chromium lokalnie pod `/cevagra/`; nie fizyczne
ustawienia hardware cursor w poszczególnych OS ani Safari/Firefox. Overlay wymaga
wcześniejszego zdarzenia myszy; przy czysto klawiaturowej obsłudze bez znanej
pozycji nie tworzy fikcyjnego wskaźnika. Native caret i edycja nadal działają.
Publicznej strony GitHub Pages nie zweryfikowano bezpośrednio.
