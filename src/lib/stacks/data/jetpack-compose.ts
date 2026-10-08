import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "jetpack-compose",
  project: "repcount-android",
  branch: "feat/workout-history-sync",
  indent: "Spaces: 4",
  files: [
    "settings.gradle.kts",
    "app/build.gradle.kts",
    "app/src/main/java/app/repcount/RepCountApp.kt",
    "app/src/main/java/app/repcount/data/workouts/WorkoutDao.kt",
    "app/src/main/java/app/repcount/data/workouts/WorkoutSyncRepository.kt",
    "app/src/main/java/app/repcount/ui/workouts/WorkoutListScreen.kt",
    "app/src/main/java/app/repcount/ui/workouts/WorkoutListViewModel.kt",
    "app/src/test/java/app/repcount/ui/workouts/WorkoutListViewModelTest.kt",
  ],
  snippets: [
    {
      filename: "app/src/main/java/app/repcount/ui/workouts/WorkoutListScreen.kt",
      syntax: "clike",
      languageLabel: "Kotlin",
      code: `package app.repcount.ui.workouts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun WorkoutListRoute(
    onOpenWorkout: (Long) -> Unit,
    viewModel: WorkoutListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    WorkoutListScreen(
        state = state,
        onRefresh = viewModel::refresh,
        onOpenWorkout = onOpenWorkout,
        onMessageShown = viewModel::messageShown,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutListScreen(
    state: WorkoutListUiState,
    onRefresh: () -> Unit,
    onOpenWorkout: (Long) -> Unit,
    onMessageShown: () -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            onMessageShown()
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Workouts") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isSyncing,
            onRefresh = onRefresh,
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
                    items(state.workouts, key = { it.id }) { workout ->
                        WorkoutItem(
                            workout = workout,
                            onClick = { onOpenWorkout(workout.id) },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkoutItem(workout: WorkoutRow, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val summary = "\${workout.title}, \${workout.dateLabel}, \${workout.durationMinutes} minutes"
    ListItem(
        headlineContent = { Text(workout.title) },
        supportingContent = { Text("\${workout.dateLabel} · \${workout.durationMinutes} min") },
        trailingContent = { Text("%.0f kg".format(workout.totalVolumeKg)) },
        modifier = modifier
            .clickable(onClickLabel = "Open workout", onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = summary },
    )
}
`,
    },
    {
      filename: "app/src/main/java/app/repcount/ui/workouts/WorkoutListViewModel.kt",
      syntax: "clike",
      languageLabel: "Kotlin",
      code: `package app.repcount.ui.workouts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.repcount.data.workouts.WorkoutDao
import app.repcount.data.workouts.WorkoutEntity
import app.repcount.data.workouts.WorkoutSyncRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class WorkoutRow(
    val id: Long,
    val title: String,
    val dateLabel: String,
    val durationMinutes: Int,
    val totalVolumeKg: Double,
)

data class WorkoutListUiState(
    val workouts: List<WorkoutRow> = emptyList(),
    val isLoading: Boolean = true,
    val isSyncing: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class WorkoutListViewModel @Inject constructor(
    private val dao: WorkoutDao,
    private val sync: WorkoutSyncRepository,
) : ViewModel() {

    private val formatter = DateTimeFormatter.ofPattern("EEE d MMM")
    private val syncing = MutableStateFlow(false)
    private val message = MutableStateFlow<String?>(null)

    // Room is the single source of truth; sync only writes into the database
    val uiState: StateFlow<WorkoutListUiState> = combine(
        dao.observeRecent(limit = 100),
        syncing,
        message,
    ) { entities, isSyncing, msg ->
        WorkoutListUiState(
            workouts = entities.map { it.toRow() },
            isLoading = false,
            isSyncing = isSyncing,
            message = msg,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = WorkoutListUiState(),
    )

    init {
        refresh()
    }

    fun refresh() {
        if (syncing.value) return
        viewModelScope.launch {
            syncing.value = true
            try {
                sync.pullLatest().onFailure {
                    message.value = "Offline - showing saved workouts"
                }
            } finally {
                syncing.value = false
            }
        }
    }

    fun messageShown() {
        message.value = null
    }

    private fun WorkoutEntity.toRow() = WorkoutRow(
        id = id,
        title = title,
        dateLabel = startedAt.atZone(ZoneId.systemDefault()).format(formatter),
        durationMinutes = durationSeconds / 60,
        totalVolumeKg = totalVolumeKg,
    )
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Is `SharingStarted.WhileSubscribed(5_000)` the right choice here, or should it be `Eagerly`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "`WhileSubscribed(5_000)` is the recommended default for screen state. Combined with `collectAsStateWithLifecycle()`, the Room query stops collecting about five seconds after the app goes to the background, so you're not running a database observer while nothing is visible.\n\nThe five seconds matters for configuration changes: rotation tears down and recreates the collector well within that window, so the upstream isn't restarted and the user doesn't see the loading state again.\n\n`Eagerly` would keep the Room flow alive for the entire `viewModelScope`, which is only worth it if other collectors need the value while the screen is stopped. Not the case here.",
      delay: 12000,
    },
    {
      role: "user",
      content:
        "The snackbar sometimes shows twice after rotating mid-message. Why?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Because the message lives in `StateFlow` and is only cleared **after** `showSnackbar` returns. `showSnackbar` suspends until the snackbar is dismissed, so if you rotate while it's visible, the `LaunchedEffect` is cancelled before `onMessageShown()` runs. On recreation `state.message` is still set and the effect shows it again.\n\nOptions:\n1. Call `onMessageShown()` before `showSnackbar`, accepting that a rotation can drop the message.\n2. Wrap it so cancellation still clears it:\n```kotlin\ntry { snackbarHostState.showSnackbar(it) } finally { onMessageShown() }\n```\nOption 2 matches the guidance to treat one-off events as consumed state.",
      delay: 36000,
    },
    {
      role: "user",
      content: "How do I test `refresh()` without a real database?",
      delay: 49000,
    },
    {
      role: "assistant",
      content:
        "Use fakes rather than mocks for both dependencies:\n1. `FakeWorkoutDao` backed by a `MutableStateFlow<List<WorkoutEntity>>`.\n2. `FakeSyncRepository` whose `pullLatest()` returns `Result.failure(IOException())` on demand.\n\nSet `Dispatchers.setMain(StandardTestDispatcher())` in a JUnit rule, then use Turbine:\n```kotlin\nviewModel.uiState.test {\n    advanceUntilIdle()\n    assertEquals(\"Offline - showing saved workouts\", expectMostRecentItem().message)\n}\n```\nCollecting via `test {}` matters: with `WhileSubscribed`, `uiState` only emits real data while there is a subscriber. Also assert `isSyncing` returns to `false` after failure, which covers the `finally` block.",
      delay: 61000,
    },
  ],
};

export default config;
