# Spider Solitaire (Android)

A no-ads, no-tracking, no-in-app-purchases Spider Solitaire game for Android.
Written in Kotlin with Jetpack Compose. Runs entirely offline — the app
requests no permissions and makes no network calls of any kind.

The game lives inside the `Sanitiser` repo purely as a convenient place to
version it; it shares no code with the casework sanitisation tool at the
repository root.

## Build the APK

The project does not ship with the Gradle wrapper jar (Gradle's release
host is not reachable from the environment that generated this project).
You need to either open it in Android Studio, which downloads Gradle
automatically, or install Gradle yourself and run `gradle wrapper` once
before using `./gradlew`.

### Option A — Android Studio (recommended)

1. Open Android Studio and choose **File → Open**, then pick this
   `android/` directory.
2. When prompted, let it sync — it will download Gradle 8.9 and the
   Android Gradle Plugin the first time.
3. Plug in your phone with USB debugging enabled, or start an emulator,
   then click **Run**.

### Option B — Command line

You will need:

- Java 17 (`java -version` must report 17.x).
- Android SDK with Platform 34 and Build-Tools 34.x installed.
  Set `ANDROID_HOME` (or create `local.properties` with
  `sdk.dir=/path/to/Android/sdk`).
- Gradle 8.9+ available as `gradle`.

Then from this directory:

```
gradle wrapper --gradle-version 8.9   # one-time, creates gradlew + gradle-wrapper.jar
./gradlew assembleDebug
```

The debug APK is written to
`app/build/outputs/apk/debug/app-debug.apk`. Copy it to your phone and
open it to install — you may need to enable "Install unknown apps" for
your file manager on Android 8+.

For a release build:

```
./gradlew assembleRelease
```

The release APK is unsigned by default; sign it with your own key before
distributing.

## Run the tests

```
./gradlew testDebugUnitTest
```

Pure-Kotlin JVM tests covering the game rules live under
`app/src/test/java/com/billgimimus/spider/game/`.

## What's implemented

- Difficulty picker: 1 suit, 2 suits, 4 suits.
- 10-column tableau with stock pile in the bottom-right.
- Tap a card to pick up the same-suit descending run it starts, tap
  another column to drop it there. Tap again to deselect.
- Tap the stock to deal one card face-up to every column (blocked while any
  column is empty, per Spider rules).
- Any K→A same-suit run at the bottom of a column is swept to a foundation
  automatically. The top of the screen shows `Suits N/8`.
- **New deal**: start a fresh shuffle at the current difficulty.
- **Restart same deal**: replay the same shuffle (uses the seed stored on
  the current game state).
- **Auto-complete**: appears in the top bar once every card is face-up and
  the stock is empty. Runs a greedy consolidation to finish the game.
- Win dialog on 8 foundations, showing move count.

## What's intentionally left out

- No undo, per the initial scoping conversation. Easy to add later — the
  game state is immutable, so an undo stack is a list of `GameState`.
- No timer, score, or move-count leaderboard. The move count is shown but
  not persisted.
- No animations beyond Compose's default recomposition. Cards snap.
- No sound.
