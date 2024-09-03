import { Context, Dict, Schema, Disposable } from 'koishi'

export function apply(ctx: Context, config: Config) {
    const states: Dict<MessageState> = {}

    function getState(key: string) {
        if (!states[key]) {
            states[key] = { count: 0 }
        }
        return states[key]
    }

    function addState(key: string) {
        const state = getState(key)
        state.count++

        state.interval?.()
        state.interval = ctx.setTimeout(() => {
            delete state[key]
        }, 60000)
        return state.count >= config.limit
    }

    ctx.before('command/execute', ({ command, session }) => {
        if (command.name !== 'echo') {
            return
        }
        if (!config.echoProtect) {
            return
        }

        const key = session.guildId || session.userId

        if (addState(key)) {
            ctx.logger.debug('你的 bot 可能在遭受 echo 攻击')

            return ''
        }
    })

    ctx.before('send', (session) => {
        if (!config.sendMessageProtect) {
            return
        }

        const key = session.guildId || session.userId

        if (addState(key)) {
            return false
        }
    })

    ctx.on('message', async (session) => {
        if (!config.receiveMessageProtect) {
            return
        }

        const key = session.guildId || session.userId

        if (addState(key)) {
            // 暂时下线 bot
            const bot = session.bot

            const adapter = bot.adapter
            await bot.stop()

            // 检查 adapter 是否有 stop 方法，强行调用
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((adapter as any).stop) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (adapter as any).stop()
            }

            bot.offline(new Error('你的 bot 正在被攻击，暂时下线'))
            ctx.logger.error('你的 bot 可能遭受攻击，已暂时下线')
            ctx.setTimeout(
                async () => {
                    ctx.logger.info('正在重新上线 bot')
                    ctx.loader.fullReload(52)
                },
                60 * config.restartTime * 1000
            )
            return false
        }
    })
}

export interface MessageState {
    count: number
    interval?: Disposable
}

export interface Config {
    echoProtect: boolean
    limit: number
    receiveMessageProtect: boolean
    sendMessageProtect: boolean
    restartTime: number
}

export const Config = Schema.object({
    limit: Schema.number()
        .description('限制的最小消息触发次数（一分钟内）')
        .default(50),
    restartTime: Schema.number()
        .description(
            '当适配器被断开后多少时间内重启 Koishi 以上线 bot（按分钟计算）'
        )
        .min(1)
        .default(3),
    echoProtect: Schema.boolean()
        .description('是否启用 echo 保护。开启后将不允许大量的 echo 消息调用。')
        .default(true),
    receiveMessageProtect: Schema.boolean()
        .description(
            '是否启用接收消息保护。开启后将不允许大量的接收消息（不推荐开启）。'
        )
        .default(false),
    sendMessageProtect: Schema.boolean()
        .description('是否启用发送消息保护。开启后将不允许大量的发送消息。')
        .default(true)
})

export const name = 'bot-ddos-protect'
