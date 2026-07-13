package com.billgimimus.spider.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GameStateTest {

    @Test
    fun `new one-suit game has 54 dealt cards and 50 in stock`() {
        val g = GameState.newGame(Difficulty.ONE_SUIT, seed = 1L)
        val dealt = g.columns.sumOf { it.size }
        assertEquals(54, dealt)
        assertEquals(50, g.stock.size)
        for ((i, col) in g.columns.withIndex()) {
            val expected = if (i < 4) 6 else 5
            assertEquals("column $i", expected, col.size)
            assertTrue(col.last().faceUp)
            for (k in 0 until col.size - 1) assertFalse(col[k].faceUp)
        }
    }

    @Test
    fun `one-suit deck is all spades`() {
        val g = GameState.newGame(Difficulty.ONE_SUIT, seed = 42L)
        val all = g.columns.flatten() + g.stock
        assertEquals(104, all.size)
        assertTrue(all.all { it.suit == Suit.SPADES })
    }

    @Test
    fun `four-suit deck has 26 of each suit`() {
        val g = GameState.newGame(Difficulty.FOUR_SUITS, seed = 7L)
        val all = g.columns.flatten() + g.stock
        assertEquals(104, all.size)
        val bySuit = all.groupingBy { it.suit }.eachCount()
        for (s in Suit.values()) assertEquals(26, bySuit[s])
    }

    @Test
    fun `stock deal is forbidden when a column is empty`() {
        val g = handCraftedState(
            columns = List(10) { i -> if (i == 3) emptyList() else listOf(card(1, Suit.SPADES, faceUp = true)) },
            stock = List(10) { card(2, Suit.SPADES) },
        )
        assertFalse(g.canDealStock())
    }

    @Test
    fun `stock deal adds one card to each column and increments moves`() {
        val g = handCraftedState(
            columns = List(10) { listOf(card(5, Suit.SPADES, faceUp = true)) },
            stock = (0 until 10).map { card(2, Suit.SPADES) },
        )
        val after = g.dealStock()
        assertEquals(0, after.stock.size)
        for (col in after.columns) {
            assertEquals(2, col.size)
            assertTrue(col.last().faceUp)
        }
        assertEquals(1, after.moves)
    }

    @Test
    fun `topRunStart walks up a same-suit descending run`() {
        val cards = listOf(
            card(10, Suit.HEARTS, faceUp = true),
            card(7, Suit.SPADES, faceUp = true),
            card(6, Suit.SPADES, faceUp = true),
            card(5, Suit.SPADES, faceUp = true),
        )
        val g = handCraftedState(columns = listOfColumns(cards))
        assertEquals(1, g.topRunStart(0))
    }

    @Test
    fun `run stops at a suit break`() {
        val cards = listOf(
            card(6, Suit.HEARTS, faceUp = true),
            card(5, Suit.SPADES, faceUp = true),
            card(4, Suit.SPADES, faceUp = true),
        )
        val g = handCraftedState(columns = listOfColumns(cards))
        assertEquals(1, g.topRunStart(0))
    }

    @Test
    fun `cannot pick up a face-down card`() {
        val cards = listOf(card(6, Suit.SPADES, faceUp = false), card(5, Suit.SPADES, faceUp = true))
        val g = handCraftedState(columns = listOfColumns(cards))
        assertFalse(g.isMovableGroup(0, 0))
        assertTrue(g.isMovableGroup(0, 1))
    }

    @Test
    fun `moving onto rank+1 card is legal even across suits`() {
        val c0 = listOf(card(8, Suit.HEARTS, faceUp = true))
        val c1 = listOf(card(7, Suit.SPADES, faceUp = true))
        val g = handCraftedState(columns = listOf(c0, c1) + List(8) { emptyList() })
        assertTrue(g.canMove(fromCol = 1, fromIdx = 0, toCol = 0))
    }

    @Test
    fun `moving onto same-rank card is illegal`() {
        val c0 = listOf(card(7, Suit.HEARTS, faceUp = true))
        val c1 = listOf(card(7, Suit.SPADES, faceUp = true))
        val g = handCraftedState(columns = listOf(c0, c1) + List(8) { emptyList() })
        assertFalse(g.canMove(1, 0, 0))
    }

    @Test
    fun `any card can move onto empty column`() {
        val c0 = listOf(card(5, Suit.HEARTS, faceUp = true))
        val g = handCraftedState(columns = listOf(c0) + List(9) { emptyList() })
        assertTrue(g.canMove(0, 0, 5))
    }

    @Test
    fun `moving cards flips the newly-exposed card`() {
        val c0 = listOf(
            card(9, Suit.SPADES, faceUp = false),
            card(5, Suit.HEARTS, faceUp = true),
        )
        val c1 = listOf(card(6, Suit.SPADES, faceUp = true))
        val g = handCraftedState(columns = listOf(c0, c1) + List(8) { emptyList() })
        val after = g.applyMove(0, 1, 1)
        assertEquals(1, after.columns[0].size)
        assertTrue(after.columns[0][0].faceUp)
        assertEquals(2, after.columns[1].size)
        assertEquals(5, after.columns[1].last().rank)
    }

    @Test
    fun `completing K to A same-suit sweeps a foundation`() {
        // Build column 0 with K..A of spades face-up at the bottom.
        val downToAce = (13 downTo 1).map { card(it, Suit.SPADES, faceUp = true) }
        val g = handCraftedState(columns = listOf(downToAce) + List(9) { emptyList() })
        val swept = g.collectFoundations()
        assertEquals(1, swept.foundations)
        assertEquals(0, swept.columns[0].size)
    }

    @Test
    fun `mixed-suit descending run is not swept`() {
        val nearlyClean = buildList {
            for (r in 13 downTo 2) add(card(r, Suit.SPADES, faceUp = true))
            add(card(1, Suit.HEARTS, faceUp = true))
        }
        val g = handCraftedState(columns = listOf(nearlyClean) + List(9) { emptyList() })
        val swept = g.collectFoundations()
        assertEquals(0, swept.foundations)
        assertEquals(13, swept.columns[0].size)
    }

    @Test
    fun `applyMove throws on illegal move`() {
        val c0 = listOf(card(5, Suit.SPADES, faceUp = true))
        val c1 = listOf(card(5, Suit.HEARTS, faceUp = true))
        val g = handCraftedState(columns = listOf(c0, c1) + List(8) { emptyList() })
        try {
            g.applyMove(0, 0, 1)
            assertTrue("expected exception", false)
        } catch (_: IllegalArgumentException) {
        }
    }

    @Test
    fun `canAutoComplete is false with face-down cards`() {
        val g = GameState.newGame(Difficulty.ONE_SUIT, seed = 3L)
        assertFalse(g.canAutoComplete())
    }

    @Test
    fun `canAutoComplete is true on sorted face-up board with empty stock`() {
        val col = listOf(
            card(9, Suit.HEARTS, faceUp = true),
            card(8, Suit.SPADES, faceUp = true),
            card(7, Suit.HEARTS, faceUp = true),
        )
        val g = handCraftedState(columns = listOf(col) + List(9) { emptyList() }, stock = emptyList())
        assertTrue(g.canAutoComplete())
    }

    @Test
    fun `same seed replays identically`() {
        val a = GameState.newGame(Difficulty.FOUR_SUITS, seed = 12345L)
        val b = GameState.newGame(Difficulty.FOUR_SUITS, seed = 12345L)
        assertEquals(a.columns.map { it.map { c -> Triple(c.suit, c.rank, c.faceUp) } },
            b.columns.map { it.map { c -> Triple(c.suit, c.rank, c.faceUp) } })
        assertEquals(a.stock.map { it.rank to it.suit }, b.stock.map { it.rank to it.suit })
    }

    // --- helpers ---

    private var nextId = 0
    private fun card(rank: Int, suit: Suit, faceUp: Boolean = false): Card =
        Card(id = nextId++, suit = suit, rank = rank, faceUp = faceUp)

    private fun listOfColumns(single: List<Card>): List<List<Card>> =
        listOf(single) + List(9) { emptyList() }

    private fun handCraftedState(
        columns: List<List<Card>>,
        stock: List<Card> = emptyList(),
        foundations: Int = 0,
        difficulty: Difficulty = Difficulty.ONE_SUIT,
    ): GameState = GameState(
        columns = columns,
        stock = stock,
        foundations = foundations,
        difficulty = difficulty,
        moves = 0,
        seed = 0L,
    )
}
