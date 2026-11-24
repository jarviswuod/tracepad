## Suggestions/Improvements

Version one to have snapshot for saving note versions [save compute]
Version two to have diff for saving note versions [save space]

Version one: Subtle dot when typing and not prevent typing when syncing between a device which was offline getting online, mid typing

Version two: should have payments: ksh 20/ month for compute and making things run. Majorly for supporting my work. It's also just too cheap
Version two: If someone is generous enough, I'll add my mpesa number: 0757464904

Version two: personal notes shouldn't be kept for too long list, but not deleted too. Too long it becomes overwhelming and easy to loose track on what's really important to someone
Intentionally limit the user and force them to archieve some notes. Archieve notes often to solve on that issue
Have a notification, named I'm moving this notes over to this other place to keep things neat and tidy for clean slate start

Help me think of how to make it easy(atomic habit way) to review notes(weekly, daily, monthly, quaterly)
Set remainders and follow strictly. Say have a pop up on screen like a notification then open the app by default where the user "notes to be reviewd" are
Blocking distracting apps, not the whole device, with a minimum time gate before you can snooze it

Have something for archieving notes automatically
Have a notification, say "Moving notes to archieve do review" with remainders for then move over to archieve. This is to keep notes short, neat, tidy helping them become more focused on what happens. By default you could move it after 3 days, 24 hrs or 1 week, depending on how often someone takes notes

## New knowledge

Understand sorting: custom drag feature, newest first, recently edited first

2 syncs, one from server, one from local device DB. It's a job that runs after 'n' seconds
Tools/tech to achieve sync

- Android: Room, WorkManager, Retrofit
- Web: IndexedDB, Fetch, service worker

Sync options

1. keep latest
2. preserve both
3. ask the user
4. try to merge

New Tools discovered:

- SQLite's FTS5 (for searching)
- IndexDB (browser storage)
- Dexie(Wrapper to talk to IndexDB on sync) vs IndexDB
- WorkManager & AlarmManager on OS(sending remainder/ alarm/ notification)

## Adding

UI should look like google keep, both android and web versions
Have a tutorial/ illustration of how to use the app/ website for first time users
Have test cases for every feature added both good and bad cases

Have some dummy data for first time users, they have the option to delete it or just leave it as the first and only note they found. It should have 2 version histories, no labels and just default colors. creation time should be tomorror 22 nov and edtis happens one hour later (30mins first, then 30 mins second version)

Add email verification part too, I dont want people to just have dummy emails/ invalid emails in the app/website DB (Just have serious people access and try out the app)
password reset should be avaiable

How about the tiny decision say use mvc pattern for server, mockito and junit 5. I kinda wanna know those decisions you made for almost every thing. say I recommneded this but then we have this and this options too that some people use

Note versions cannot be restored

Move to settings:
Left out by default. A switch next to the search box includes them. When included, each one is marked "Archived".

server use maven.. gradle
inspo repo: https://github.com/jarviswuod/improvedBillingSystem

Relevant tables. models for the project

## More added

Security
Testing. both generating and running tests plus manually testing it myself
System design/ system engineering

Steps for building

- Schema blueprint should be done right first
- Others follow

  ----Prompt
