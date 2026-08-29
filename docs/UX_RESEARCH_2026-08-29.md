# Audyt UX i kierunek rozwoju Taskera

Data analizy: 2026-08-29

## Status realizacji

Pierwsza iteracja P0 została wdrożona 2026-08-29:

- zadania znajdują się przed licznikami, a statystyki są stale widoczne pod listą,
- „Dzisiaj” ma sekcje „Po terminie”, „Plan na dziś” i „Termin na dziś”,
- wykonawca może przypiąć dowolne własne aktywne zadanie do dzisiejszego planu,
- lista została zagęszczona i eksponuje termin oraz wysoki/pilny priorytet,
- formularz szybkiego dodawania pokazuje najpierw tylko najczęściej używane pola,
- na telefonie centralny przycisk `+` jest dostępny stale w dolnym pasku,
- termin można przesunąć jednym działaniem na jutro albo za tydzień,
- znaki tekstowe w głównej nawigacji zastąpiono spójnymi ikonami liniowymi SVG.

Do następnej iteracji pozostają wyszukiwanie/paleta poleceń, tygodniowy planer oraz pełny obieg przyjęcia lub negocjacji delegowanego zadania.

## Cel

Tasker ma pozostać prostym narzędziem dla małego zespołu, ale szybciej odpowiadać na trzy codzienne pytania:

1. Co naprawdę muszę zrobić dzisiaj?
2. Co przekazałem innym i gdzie czekam na odpowiedź?
3. Jak dodać lub przesunąć zadanie bez wypełniania długiego formularza?

Analiza obejmuje obecny interfejs Taskera oraz wzorce z Todoist, TickTick, Microsoft To Do, Things, Sunsama i Asany. Wnioski nie są listą funkcji do bezrefleksyjnego skopiowania. Priorytetem jest mniejsza liczba decyzji i kliknięć, szczególnie na telefonie.

## Co już działa dobrze w Taskerze

- Spójna, spokojna paleta zieleni i jasnych powierzchni pasuje do narzędzia używanego wiele razy dziennie.
- Główne stany zadania są widoczne w nawigacji: bieżące, oczekujące, delegowane, cykliczne i zrobione.
- Widok „Dzisiaj” łączy zadania na dziś i po terminie, a kafle podsumowania dają szybki obraz sytuacji.
- Na telefonie działa dolna nawigacja i menu „Więcej”, w tym dostęp do ustawień oraz powiadomień.
- Lista pokazuje wykonawcę, termin i status bez konieczności otwierania szczegółów.
- Integracje Google Calendar, Telegram i Web Push zmniejszają zależność od ciągłego otwierania panelu.

## Wzorce warte przeniesienia

### Todoist — jedno szybkie wejście i elastyczny widok

Todoist pozwala wpisać w jednym polu tytuł, naturalnie opisaną datę, termin, priorytet i przypomnienie. Ten sam zbiór zadań można później oglądać jako listę, tablicę albo kalendarz, a mobilny pasek nawigacji jest konfigurowalny. Najważniejszy wzorzec dla Taskera to nie liczba widoków, lecz szybkie przechwycenie sprawy bez przechodzenia przez pełny formularz.

Źródła: [Task Quick Add](https://www.todoist.com/help/todoist/features/use-task-quick-add-in-todoist-va4Lhpzz), [widoki listy, tablicy i kalendarza](https://www.todoist.com/help/todoist/features/customize-views-in-todoist-AoHhBxFdZ), [mobilna nawigacja](https://www.todoist.com/help/todoist/features/customize-the-todoist-navigation-bar-L4qpkI0xj).

### Microsoft To Do — świadomy plan dnia

„My Day” jest krótką, osobistą listą wybieraną na dany dzień. Resetuje się nocą, a niezrobione pozycje wracają jako sugestie, zamiast stale obciążać ekran. Tasker automatycznie pokazuje wszystkie zadania na dziś i po terminie, ale nie pozwala jeszcze użytkownikowi wybrać małego zestawu najważniejszych spraw.

Źródło: [My Day and suggestions](https://support.microsoft.com/en-US/ToDo/my-day-and-suggestions).

### Things — dyscyplina wizualna i progresywne ujawnianie

Things eksponuje tytuł i wykonanie, natomiast dodatkowe pola pozostają schowane do chwili, gdy są potrzebne. Wyszukiwanie służy równocześnie jako szybka nawigacja. Mobilny przycisk dodawania można przeciągnąć do konkretnego miejsca listy, a widok „Upcoming” ułatwia przełożenie zadania na inny dzień.

Źródła: [funkcje i wzorce interakcji Things](https://culturedcode.com/things/features/), [Quick Find](https://culturedcode.com/things/support/articles/2803584/).

### TickTick — planowanie czasu bez utraty prostoty listy

TickTick łączy wiele przypomnień, przypomnienie aż do wykonania, kalendarz, linię czasu i alternatywne widoki. Tasker ma już silniejszą od typowej listy logikę wielokrotnych alertów. Najbardziej wartościowym brakującym elementem jest wizualne rozłożenie zadań w czasie, nie kolejne typy przypomnień.

Źródło: [TickTick Features](https://ticktick.com/features?language=en_US).

### Sunsama — realistyczna pojemność dnia

Sunsama prowadzi użytkownika przez krótki rytuał planowania, pozwala oszacować czas zadania i przeciągać zadania na kalendarz. Dla Taskera warto zacząć od lekkiej wersji: plan na dziś, opcjonalny przewidywany czas i ostrzeżenie, gdy suma przekracza dostępny dzień.

Źródło: [Sunsama Daily Planning](https://www.sunsama.com/daily-planning).

### Asana — czytelne przyjęcie delegowanego zadania

Asana oddziela ostatnio przypisane sprawy od uporządkowanej listy użytkownika, pozwala automatycznie grupować je w sekcje i udostępnia kilka widoków tego samego zbioru. Dla Taskera istotny jest wzorzec „Nowo przypisane”: odbiorca powinien łatwo zauważyć nowe zadanie i świadomie je przyjąć albo zgłosić problem z terminem.

Źródło: [Asana My Tasks](https://asana.com/features/project-management/my-tasks).

## Najważniejsze problemy obecnego interfejsu

1. Dodanie zadania w panelu prowadzi do osobnej, długiej strony. Pola widoczności, udostępniania, cyklu i interwału są pokazywane nawet wtedy, gdy większość prostych zadań ich nie potrzebuje.
2. „Dzisiaj” jest widokiem terminów, a nie prawdziwym planem dnia. Przy większej liczbie zaległości lista może stać się karą zamiast pomocą.
3. Zadania po terminie i na dziś są w jednej płaskiej liście. Trudniej ocenić, co jest zaległością, co wydarzy się dziś, a co ma konkretną godzinę.
4. Na telefonie dolny pasek zajmują cztery kategorie zadań i „Więcej”, natomiast najczęstsza czynność — dodanie — nie ma centralnego, zawsze dostępnego przycisku.
5. Nie ma globalnego wyszukiwania ani palety poleceń. Przy rosnącej historii odnalezienie zadania będzie wymagać przechodzenia przez widoki.
6. Status delegowania jest widoczny, ale brakuje szybkiego obrazu „nowe”, „przyjęte”, „czekam na odpowiedź” i „zagrożony termin”.
7. Kafle podsumowania zajmują dużo miejsca również w widokach, w których użytkownik chce przede wszystkim pracować z listą.
8. Interfejs używa znaków tekstowych jako ikon. Są lekkie technicznie, ale mniej spójne optycznie i gorzej komunikują funkcje niż jeden zestaw ikon SVG.

## Rekomendowany zakres

### P0 — następna mała wersja

#### 1. Szybkie dodawanie

- Stały przycisk `+` na telefonie i skrót `Q` / `Ctrl+K` na komputerze.
- Pierwszy krok zawiera jedno pole: „Co trzeba zrobić?”.
- Tekst może rozpoznać datę, godzinę i wykonawcę, np. „wyślij ofertę Michałowi jutro 10:00”.
- Pod polem są cztery szybkie kontrolki: wykonawca, termin, priorytet i „więcej opcji”.
- Widoczność, udostępnianie i cykliczność są schowane pod „więcej opcji”.
- Przed zapisem interfejs pokazuje jednoznaczne podsumowanie, szczególnie różnicę między „dla mnie” a delegowaniem.

#### 2. Prawdziwy plan „Dzisiaj”

- Sekcje: „Po terminie”, „Plan na dziś”, „Dziś o konkretnej godzinie”.
- Użytkownik może przypiąć do planu maksymalnie kilka priorytetów niezależnie od terminu.
- Rano pojawia się niewielki panel „Zaplanuj dzień” z sugestiami: zaległe, pilne i kończące się dziś.
- Kafle statystyk na telefonie pozostają widoczne w zwartym, dwukolumnowym podsumowaniu.

#### 3. Mobilna nawigacja nastawiona na działanie

- Docelowy pasek: `Dzisiaj`, `Zadania`, centralne `+`, `Powiadomienia`, `Więcej`.
- „Bieżące”, „Oczekujące”, „Delegowane”, „Cykliczne” i „Zrobione” stają się filtrami w ekranie „Zadania”.
- Ustawienia pozostają w „Więcej”; obecny dostęp mobilny należy zachować.

#### 4. Skanowalna lista

- Pierwszy wiersz: checkbox, tytuł, godzina/termin.
- Drugi wiersz tylko wtedy, gdy wnosi informację: avatar i wykonawca, delegujący albo krótki status.
- Kolor uzupełnia tekst i ikonę, nigdy nie jest jedynym nośnikiem stanu.
- Przesunięcie terminu o jutro, tydzień lub własną datę jest dostępne jednym dotknięciem z menu zadania.

### P1 — po pilotażu i obserwacji użycia

#### 5. Wyszukiwanie i paleta poleceń

- Wyszukiwanie po tytule, opisie, osobie i statusie.
- Szybka nawigacja do widoku oraz polecenia „dodaj”, „przesuń”, „zakończ”.
- Skrót `Ctrl+K` na komputerze i gest ściągnięcia listy na telefonie.

#### 6. Tygodniowy planer

- Prostą listę „Nadchodzące 7 dni” wdrożyć przed pełnym kalendarzem.
- Następnie dodać tygodniowy widok czasu z przeciąganiem zadań i wydarzeń Google Calendar.
- Opcjonalne pole „szacowany czas” umożliwi ostrzeganie o przeciążonym dniu.

#### 7. Lepszy obieg delegowania

- Nowo przypisane zadanie otrzymuje stan informacyjny „Nowe dla Ciebie” do pierwszego otwarcia.
- Szybkie akcje: „Przyjmuję”, „Zaproponuj termin”, „Potrzebuję informacji”.
- Widok delegującego pokazuje ostatnią aktywność i czy wykonawca widział zadanie.
- Panel administratora/właściciela może pokazać liczbę zadań na osobę, ale bez budowania rozbudowanego systemu kontroli czasu.

#### 8. Powiadomienia jako skrzynka działań

- Powiadomienie można zakończyć, odłożyć albo otworzyć bez przechodzenia do osobnego ekranu.
- Grupowanie kilku alertów tego samego zadania zapobiega wizualnemu spamowi.
- Filtry: wymagające działania, komentarze, przypomnienia i systemowe.

### P2 — tylko jeśli pilotaż potwierdzi potrzebę

- Widok Kanban dla procesów zespołowych.
- Zapisane filtry i własne układy nawigacji.
- Tryb skupienia z timerem/Pomodoro.
- Motyw ciemny i dodatkowe motywy kolorystyczne.
- Rozbudowane zależności, Gantt i raportowanie obciążenia.

Te funkcje są popularne w dojrzałych produktach, ale przed potwierdzeniem potrzeby zwiększyłyby złożoność Taskera bardziej niż jego użyteczność.

## Kierunek wizualny

- Zachować obecną zieleń jako rozpoznawalny kolor produktu.
- Zmniejszyć wysokość kafli i odstępy w widokach roboczych, pozostawiając więcej przestrzeni na ekranach logowania i pustych stanach.
- Wprowadzić jeden zestaw prostych ikon liniowych SVG o jednakowej grubości kreski.
- Ujednolicić promienie: małe dla kontrolek, średnie dla kart, duże tylko dla głównych paneli.
- Statusy pokazywać jako krótki tekst + ikonę; czerwony rezerwować dla zaległości lub błędu.
- Szczegóły zadania otwierać na komputerze w panelu po prawej, a na telefonie jako pełny ekran. Pozwala to zachować kontekst listy.
- Animacje ograniczyć do potwierdzenia wykonania, otwierania panelu i zmiany kolejności; powinny być krótkie i respektować `prefers-reduced-motion`.

## Proponowana kolejność wdrożenia

1. Szybkie dodawanie i uproszczony formularz.
2. Sekcje w „Dzisiaj” i kompaktowa lista mobilna.
3. Nowy mobilny pasek z centralnym `+`.
4. Wyszukiwanie / paleta poleceń.
5. Przyjęcie lub negocjacja delegowanego zadania.
6. Widok najbliższych 7 dni, następnie planer tygodnia.
7. Dopiero na podstawie danych z pilotażu: Kanban, timer i zaawansowane raporty.

## Jak zmierzyć poprawę

- Mediana czasu od wejścia do zapisania prostego zadania: poniżej 10 sekund.
- Proste zadanie własne: maksymalnie jedno pole obowiązkowe i dwa działania do zapisu.
- Użytkownik znajduje ustawienia, powiadomienia i nowe zadanie na telefonie bez instrukcji.
- Co najmniej 80% zadań utworzonych w pilotażu nie wymaga otwierania „więcej opcji”.
- Spada liczba szkiców Telegrama poprawianych z powodu złego wykonawcy.
- Użytkownik potrafi wskazać trzy priorytety dnia bez przeglądania wszystkich kategorii.
