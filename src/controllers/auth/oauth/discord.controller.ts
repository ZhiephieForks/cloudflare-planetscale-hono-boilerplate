import { Handler } from 'hono'
import type { StatusCode } from 'hono/utils/http-status'
import httpStatus from 'http-status'
import { discord } from 'worker-auth-providers'
import { authProviders } from '../../../config/authProviders'
import { getConfig } from '../../../config/config'
import * as authValidation from '../../../validations/auth.validation'
import { oauthCallback, oauthLink, deleteOauthLink } from './oauth.controller'

const discordRedirect: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const location = await discord.redirect({
    options: {
      clientId: config.oauth.discord.clientId,
      redirectUrl: config.oauth.discord.redirectUrl,
      scope: 'identify email'
    }
  })
  return c.redirect(location, httpStatus.FOUND as StatusCode)
}

const discordCallback: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const queryParse = c.req.query()
  authValidation.oauthCallback.parse(queryParse)
  const oauthRequest = discord.users({
    options: {
      clientId: config.oauth.discord.clientId,
      clientSecret: config.oauth.discord.clientSecret,
      redirectUrl: config.oauth.discord.redirectUrl
    },
    request: c.req
  })
  return oauthCallback(c, oauthRequest, authProviders.DISCORD)
}

const linkDiscord: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const bodyParse = await c.req.json()
  const { code } = authValidation.oauthCallback.parse(bodyParse)
  const url = new URL(c.req.url)
  url.searchParams.set('code', code)
  const request = new Request(url.toString())
  const oauthRequest = discord.users({
    options: {
      clientId: config.oauth.discord.clientId,
      clientSecret: config.oauth.discord.clientSecret,
      redirectUrl: config.oauth.discord.redirectUrl
    },
    request
  })
  return oauthLink(c, oauthRequest, authProviders.DISCORD)
}

const deleteDiscordLink: Handler<{ Bindings: Bindings }> = async (c) => {
  return deleteOauthLink(c, authProviders.DISCORD)
}

export {
  discordRedirect,
  discordCallback,
  linkDiscord,
  deleteDiscordLink
}
