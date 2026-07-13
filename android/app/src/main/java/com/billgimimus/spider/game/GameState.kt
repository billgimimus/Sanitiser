package com.billgimimus.spider.game

import kotlin.random.Random

/**
 * Immutable snapshot of a Spider Solitaire game. All mutation returns a new
 * [GameState] — the ViewModel keeps the current one and swaps it on every move.
 *
 * Rules implemented:
 *   * 104-card deck. In 1-suit games every card is a spade; in 2-suit games
 *     the deck is half spades and half hearts; in 4-suit games it uses all
 *     four suits.
 *   * 10 tableau columns. Columns 0..3 start with 6 cards, 4..9 with 5 cards;
 *     only the last card of each column is face up.
 *   * Stock holds the remaining 50 cards, dealt 10 at a time.
 *   * A move picks a face-up card and all cards above it. The picked group
 *     must form a same-suit descending run (K,Q,J,...). It can only land on
 *     an empty column, or on a card one rank higher than the group's top.
 *   * Stock deals one card face-up to every column. Forbidden while any
 *     column is empty.
 *   * When the top of a column becomes a K-through-A same-suit descending
 *     sequence, those 13 cards leave to a foundation.
 *   * Win: 8 foundations completed.
 */
data class GameState(
    val columns: List<List<Card>>,
    val stock: List<Card>,
    val foundations: Int,
    val difficulty: Difficulty,
    val moves: Int,
    val seed: Long,
) {

    val isWon: Boolean get() = foundations == 8

    fun canDealStock(): Boolean =
        stock.isNotEmpty() && columns.none { it.isEmpty() }

    /**
     * Returns the index of the topmost card in [col] that can be picked up
     * together (i.e. the start of the same-suit descending run leading down
     * to the bottom of the column), or `null` if the column has no face-up
     * card.
     */
    fun topRunStart(col: Int): Int? {
        val column = columns[col]
        if (column.isEmpty()) return null
        val bottom = column.lastIndex
        if (!column[bottom].faceUp) return null
        var start = bottom
        while (start > 0) {
            val above = column[start - 1]
            val here = column[start]
            if (!above.faceUp) break
            if (above.suit != here.suit) break
            if (above.rank != here.rank + 1) break
            start--
        }
        return start
    }

    /** True if the cards from [fromIdx] to end of [fromCol] form a same-suit descending run. */
    fun isMovableGroup(fromCol: Int, fromIdx: Int): Boolean {
        val column = columns[fromCol]
        if (fromIdx < 0 || fromIdx >= column.size) return false
        if (!column[fromIdx].faceUp) return false
        for (i in fromIdx until column.lastIndex) {
            val a = column[i]
            val b = column[i + 1]
            if (a.suit != b.suit) return false
            if (a.rank - 1 != b.rank) return false
        }
        return true
    }

    fun canMove(fromCol: Int, fromIdx: Int, toCol: Int): Boolean {
        if (fromCol == toCol) return false
        if (!isMovableGroup(fromCol, fromIdx)) return false
        val moving = columns[fromCol][fromIdx]
        val target = columns[toCol]
        if (target.isEmpty()) return true
        val landing = target.last()
        if (!landing.faceUp) return false
        return landing.rank == moving.rank + 1
    }

    fun applyMove(fromCol: Int, fromIdx: Int, toCol: Int): GameState {
        require(canMove(fromCol, fromIdx, toCol)) { "illegal move $fromCol[$fromIdx] -> $toCol" }
        val src = columns[fromCol]
        val group = src.subList(fromIdx, src.size).toList()
        val newFrom = src.subList(0, fromIdx).toMutableList().also { rem ->
            if (rem.isNotEmpty()) {
                val last = rem.removeAt(rem.lastIndex)
                rem.add(last.copy(faceUp = true))
            }
        }
        val newTo = (columns[toCol] + group).toMutableList()
        val nextColumns = columns.toMutableList().apply {
            this[fromCol] = newFrom
            this[toCol] = newTo
        }
        return copy(columns = nextColumns, moves = moves + 1).collectFoundations()
    }

    fun dealStock(): GameState {
        require(canDealStock()) { "stock deal not allowed right now" }
        val nextColumns = columns.toMutableList()
        val nextStock = stock.toMutableList()
        for (i in 0 until 10) {
            val card = nextStock.removeAt(nextStock.lastIndex).copy(faceUp = true)
            nextColumns[i] = nextColumns[i] + card
        }
        return copy(columns = nextColumns, stock = nextStock, moves = moves + 1)
            .collectFoundations()
    }

    /**
     * Sweep any completed K-through-A same-suit descending runs off the
     * bottom of any column into foundations. Runs may cascade: sweeping one
     * exposes a new card that might complete another (rare but possible).
     */
    fun collectFoundations(): GameState {
        var state = this
        while (true) {
            val idx = state.columns.indexOfFirst { col ->
                if (col.size < 13) return@indexOfFirst false
                val start = col.size - 13
                val top = col[start]
                if (!top.faceUp || top.rank != 13) return@indexOfFirst false
                val suit = top.suit
                for (k in 0 until 13) {
                    val card = col[start + k]
                    if (!card.faceUp || card.suit != suit || card.rank != 13 - k) {
                        return@indexOfFirst false
                    }
                }
                true
            }
            if (idx == -1) return state
            val col = state.columns[idx]
            val remaining = col.subList(0, col.size - 13).toMutableList()
            if (remaining.isNotEmpty()) {
                val last = remaining.removeAt(remaining.lastIndex)
                remaining.add(last.copy(faceUp = true))
            }
            val nextColumns = state.columns.toMutableList().apply { this[idx] = remaining }
            state = state.copy(columns = nextColumns, foundations = state.foundations + 1)
        }
    }

    /**
     * Auto-complete when the game is trivially finishable. Repeatedly picks
     * the move that most extends a same-suit descending run on the target
     * column. Stops when no move helps or the game is won.
     *
     * Enabled by [canAutoComplete].
     */
    fun autoComplete(): GameState {
        var state = this
        while (!state.isWon) {
            val move = state.pickAutoMove() ?: return state
            state = state.applyMove(move.fromCol, move.fromIdx, move.toCol)
        }
        return state
    }

    /**
     * A move is offered for auto-complete only when it extends a same-suit
     * descending run on the destination (or moves toward completing a
     * foundation). We prefer moves that grow the longest run.
     */
    private fun pickAutoMove(): AutoMove? {
        var best: AutoMove? = null
        var bestScore = 0
        for (fromCol in columns.indices) {
            val col = columns[fromCol]
            val start = topRunStart(fromCol) ?: continue
            val movingTop = col[start]
            for (toCol in columns.indices) {
                if (toCol == fromCol) continue
                val target = columns[toCol]
                if (target.isEmpty()) continue
                val landing = target.last()
                if (!landing.faceUp) continue
                if (landing.rank != movingTop.rank + 1) continue
                if (landing.suit != movingTop.suit) continue
                val groupSize = col.size - start
                val score = groupSize
                if (score > bestScore) {
                    bestScore = score
                    best = AutoMove(fromCol, start, toCol)
                }
            }
        }
        return best
    }

    private data class AutoMove(val fromCol: Int, val fromIdx: Int, val toCol: Int)

    /**
     * True when every column contains only face-up cards, the stock is
     * empty, and each column is already in weakly descending order (any
     * suit). This is a conservative "trivially winnable" check — the greedy
     * [autoComplete] can then finish it.
     */
    fun canAutoComplete(): Boolean {
        if (isWon) return false
        if (stock.isNotEmpty()) return false
        if (columns.any { col -> col.any { !it.faceUp } }) return false
        for (col in columns) {
            for (i in 0 until col.size - 1) {
                if (col[i].rank <= col[i + 1].rank) return false
            }
        }
        return true
    }

    companion object {
        fun newGame(difficulty: Difficulty, seed: Long = Random.nextLong()): GameState {
            val deck = buildDeck(difficulty).toMutableList()
            Random(seed).let { rng ->
                for (i in deck.indices.reversed()) {
                    val j = rng.nextInt(i + 1)
                    val tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp
                }
            }
            val columns = MutableList(10) { mutableListOf<Card>() }
            for (i in 0 until 10) {
                val count = if (i < 4) 6 else 5
                repeat(count) {
                    columns[i].add(deck.removeAt(deck.lastIndex))
                }
                val last = columns[i].removeAt(columns[i].lastIndex)
                columns[i].add(last.copy(faceUp = true))
            }
            return GameState(
                columns = columns.map { it.toList() },
                stock = deck.toList(),
                foundations = 0,
                difficulty = difficulty,
                moves = 0,
                seed = seed,
            )
        }

        private fun buildDeck(difficulty: Difficulty): List<Card> {
            val suits: List<Suit> = when (difficulty) {
                Difficulty.ONE_SUIT -> List(8) { Suit.SPADES }
                Difficulty.TWO_SUITS -> List(4) { Suit.SPADES } + List(4) { Suit.HEARTS }
                Difficulty.FOUR_SUITS ->
                    List(2) { Suit.SPADES } +
                        List(2) { Suit.HEARTS } +
                        List(2) { Suit.DIAMONDS } +
                        List(2) { Suit.CLUBS }
            }
            var id = 0
            return buildList {
                for (suit in suits) {
                    for (rank in 1..13) {
                        add(Card(id = id++, suit = suit, rank = rank, faceUp = false))
                    }
                }
            }
        }
    }
}
