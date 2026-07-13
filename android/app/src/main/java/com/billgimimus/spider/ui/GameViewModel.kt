package com.billgimimus.spider.ui

import androidx.lifecycle.ViewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.billgimimus.spider.game.Difficulty
import com.billgimimus.spider.game.GameState

sealed interface Screen {
    data object Menu : Screen
    data object Game : Screen
}

class GameViewModel : ViewModel() {

    var screen by mutableStateOf<Screen>(Screen.Menu)
        private set

    var state by mutableStateOf(GameState.newGame(Difficulty.ONE_SUIT))
        private set

    fun startNewGame(difficulty: Difficulty) {
        state = GameState.newGame(difficulty)
        screen = Screen.Game
    }

    fun restartDeal() {
        state = GameState.newGame(state.difficulty, seed = state.seed)
    }

    fun newDeal() {
        state = GameState.newGame(state.difficulty)
    }

    fun openMenu() {
        screen = Screen.Menu
    }

    fun dealFromStock() {
        if (state.canDealStock()) state = state.dealStock()
    }

    fun tryMove(fromCol: Int, fromIdx: Int, toCol: Int): Boolean {
        if (!state.canMove(fromCol, fromIdx, toCol)) return false
        state = state.applyMove(fromCol, fromIdx, toCol)
        return true
    }

    fun autoComplete() {
        if (state.canAutoComplete()) state = state.autoComplete()
    }

    /**
     * Best legal destination for the group starting at [fromCol][fromIdx] if
     * the user releases without hitting a target. Prefers a same-suit
     * landing, then any legal landing, then no move.
     */
    fun bestAutoTarget(fromCol: Int, fromIdx: Int): Int? {
        val moving = state.columns[fromCol][fromIdx]
        var sameSuit: Int? = null
        var any: Int? = null
        for (c in state.columns.indices) {
            if (c == fromCol) continue
            if (!state.canMove(fromCol, fromIdx, c)) continue
            val target = state.columns[c]
            if (target.isNotEmpty() && target.last().suit == moving.suit) {
                sameSuit = c
                break
            }
            if (any == null && target.isNotEmpty()) any = c
            if (any == null) any = c
        }
        return sameSuit ?: any
    }
}
