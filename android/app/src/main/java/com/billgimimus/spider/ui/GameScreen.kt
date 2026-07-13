package com.billgimimus.spider.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.billgimimus.spider.game.GameState
import com.billgimimus.spider.ui.theme.Felt

private data class Selection(val col: Int, val idx: Int)

@Composable
fun GameScreen(vm: GameViewModel) {
    val state = vm.state
    var selection by remember(state.seed) { mutableStateOf<Selection?>(null) }
    var showMenu by remember { mutableStateOf(false) }
    var showWin by remember(state.seed) { mutableStateOf(false) }

    if (state.isWon && !showWin) showWin = true

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Felt.TableGreen),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopBar(
                state = state,
                onMenu = { showMenu = true },
                onAutoComplete = { vm.autoComplete() },
            )
            Spacer(Modifier.height(6.dp))
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 4.dp),
            ) {
                val columnGap: Dp = 3.dp
                val cardWidth: Dp = (maxWidth - columnGap * 9) / 10
                val cardHeight: Dp = cardWidth * 1.45f
                val faceUpOverlap: Dp = cardHeight * 0.32f
                val faceDownOverlap: Dp = cardHeight * 0.15f

                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(columnGap),
                ) {
                    for (colIdx in 0 until 10) {
                        CardColumn(
                            state = state,
                            colIdx = colIdx,
                            cardWidth = cardWidth,
                            cardHeight = cardHeight,
                            faceUpOverlap = faceUpOverlap,
                            faceDownOverlap = faceDownOverlap,
                            selection = selection,
                            onCardTap = { row ->
                                selection = handleTap(vm, selection, colIdx, row)
                            },
                            onEmptyTap = {
                                selection = handleTap(vm, selection, colIdx, cardRow = -1)
                            },
                            modifier = Modifier.width(cardWidth),
                        )
                    }
                }
            }
            BottomBar(
                state = state,
                onStockTap = {
                    selection = null
                    vm.dealFromStock()
                },
            )
        }
    }

    if (showMenu) {
        MenuDialog(
            onDismiss = { showMenu = false },
            onNewDeal = { showMenu = false; vm.newDeal() },
            onRestart = { showMenu = false; vm.restartDeal() },
            onExit = { showMenu = false; vm.openMenu() },
        )
    }

    if (showWin) {
        WinDialog(
            state = state,
            onNewDeal = { showWin = false; vm.newDeal() },
            onExit = { showWin = false; vm.openMenu() },
        )
    }
}

/**
 * Selection logic: first tap picks a movable group; second tap on another
 * column tries to move there. Same-target second tap deselects.
 */
private fun handleTap(
    vm: GameViewModel,
    current: Selection?,
    col: Int,
    cardRow: Int,
): Selection? {
    val state = vm.state
    if (current == null) {
        if (cardRow < 0) return null
        if (!state.isMovableGroup(col, cardRow)) return null
        return Selection(col, cardRow)
    }
    if (current.col == col) {
        if (cardRow == current.idx || cardRow < 0) return null
        if (state.isMovableGroup(col, cardRow)) return Selection(col, cardRow)
        return null
    }
    val moved = vm.tryMove(current.col, current.idx, col)
    return if (moved) null else current
}

@Composable
private fun CardColumn(
    state: GameState,
    colIdx: Int,
    cardWidth: Dp,
    cardHeight: Dp,
    faceUpOverlap: Dp,
    faceDownOverlap: Dp,
    selection: Selection?,
    onCardTap: (row: Int) -> Unit,
    onEmptyTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val col = state.columns[colIdx]
    if (col.isEmpty()) {
        Box(modifier = modifier) {
            EmptySlot(width = cardWidth, height = cardHeight, onClick = onEmptyTap)
        }
        return
    }
    val density = LocalDensity.current
    val cardHeightPx = with(density) { cardHeight.roundToPx() }
    val faceUpPx = with(density) { faceUpOverlap.roundToPx() }
    val faceDownPx = with(density) { faceDownOverlap.roundToPx() }

    Layout(
        modifier = modifier,
        content = {
            for (i in col.indices) {
                val card = col[i]
                val isSelected = selection?.col == colIdx && selection.idx <= i
                CardView(
                    card = card,
                    width = cardWidth,
                    height = cardHeight,
                    selected = isSelected,
                    onClick = { onCardTap(i) },
                )
            }
        },
    ) { measurables, constraints ->
        val childConstraints = constraints.copy(minWidth = 0, minHeight = 0)
        val placeables = measurables.map { it.measure(childConstraints) }
        val n = placeables.size
        // Natural placement uses the passed-in overlaps. If the column would
        // exceed available height, shrink both overlaps by the same ratio so
        // the whole column just fits — cards stay proportionally spaced and
        // the last card is fully visible.
        val naturalHeight = if (n == 0) cardHeightPx else {
            var y = 0
            for (i in 0 until n - 1) y += if (col[i].faceUp) faceUpPx else faceDownPx
            y + cardHeightPx
        }
        val ratio: Float = if (
            constraints.hasBoundedHeight &&
            naturalHeight > constraints.maxHeight &&
            naturalHeight > cardHeightPx
        ) {
            val fit = (constraints.maxHeight - cardHeightPx).toFloat() /
                (naturalHeight - cardHeightPx).toFloat()
            fit.coerceIn(0f, 1f)
        } else 1f
        val ys = IntArray(n)
        var y = 0
        for (i in 0 until n) {
            ys[i] = y
            val overlap = if (col[i].faceUp) faceUpPx else faceDownPx
            y += (overlap * ratio).toInt().coerceAtLeast(1)
        }
        val width = placeables.firstOrNull()?.width ?: 0
        val height = if (n == 0) cardHeightPx else ys[n - 1] + cardHeightPx
        layout(width, height) {
            for (i in placeables.indices) {
                placeables[i].placeRelative(0, ys[i])
            }
        }
    }
}

@Composable
private fun TopBar(
    state: GameState,
    onMenu: () -> Unit,
    onAutoComplete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(
            onClick = onMenu,
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        ) {
            Text("Menu", color = Felt.CardFace)
        }
        Spacer(Modifier.width(12.dp))
        Text(state.difficulty.label, color = Felt.CardFace, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(12.dp))
        Text("Moves ${state.moves}", color = Felt.CardFace, fontSize = 13.sp)
        Spacer(Modifier.width(12.dp))
        Text("Suits ${state.foundations}/8", color = Felt.CardFace, fontSize = 13.sp)
        Spacer(Modifier.weight(1f))
        if (state.canAutoComplete()) {
            Button(onClick = onAutoComplete) { Text("Auto") }
        }
    }
}

@Composable
private fun BottomBar(state: GameState, onStockTap: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FoundationRow(count = state.foundations)
        Spacer(Modifier.weight(1f))
        StockPile(remaining = state.stock.size, enabled = state.canDealStock(), onTap = onStockTap)
    }
}

@Composable
private fun FoundationRow(count: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (i in 0 until 8) {
            Box(
                modifier = Modifier
                    .size(width = 18.dp, height = 26.dp)
                    .background(
                        color = if (i < count) Felt.CardFace else Felt.EmptySlot,
                        shape = RoundedCornerShape(3.dp),
                    ),
            )
        }
    }
}

@Composable
private fun StockPile(remaining: Int, enabled: Boolean, onTap: () -> Unit) {
    val stacks = remaining / 10
    val color = if (enabled) Felt.CardBack else Felt.CardBack.copy(alpha = 0.5f)
    Row(horizontalArrangement = Arrangement.spacedBy((-16).dp)) {
        if (stacks == 0) {
            Box(modifier = Modifier.size(width = 34.dp, height = 46.dp))
        } else {
            for (i in 0 until stacks) {
                val topMost = i == stacks - 1
                Box(
                    modifier = Modifier
                        .size(width = 34.dp, height = 46.dp)
                        .background(color = color, shape = RoundedCornerShape(4.dp))
                        .then(
                            if (topMost && enabled) Modifier.clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { onTap() } else Modifier
                        ),
                )
            }
        }
    }
}

@Composable
private fun MenuDialog(
    onDismiss: () -> Unit,
    onNewDeal: () -> Unit,
    onRestart: () -> Unit,
    onExit: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Menu") },
        text = { Text("Choose an option.") },
        confirmButton = {
            Column {
                TextButton(onClick = onRestart) { Text("Restart same deal") }
                TextButton(onClick = onNewDeal) { Text("New deal") }
                TextButton(onClick = onExit) { Text("Change difficulty") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

@Composable
private fun WinDialog(
    state: GameState,
    onNewDeal: () -> Unit,
    onExit: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { },
        title = { Text("You won!") },
        text = { Text("Cleared in ${state.moves} moves on ${state.difficulty.label.lowercase()}.") },
        confirmButton = { TextButton(onClick = onNewDeal) { Text("New deal") } },
        dismissButton = { TextButton(onClick = onExit) { Text("Menu") } },
    )
}
