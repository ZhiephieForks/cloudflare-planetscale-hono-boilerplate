import { Handler } from 'hono'
import type { StatusCode } from 'hono/utils/http-status'
import httpStatus from 'http-status'
import { facebook } from 'worker-auth-providers'
import { authProviders } from '../../../config/authProviders'
import { getConfig } from '../../../config/config'
import * as authValidation from '../../../validations/auth.validation'
import { oauthCallback, oauthLink, deleteOauthLink } from './oauth.controller'

const facebookRedirect: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const location = await facebook.redirect({
    options: {
      clientId: config.oauth.facebook.clientId,
      redirectUrl: config.oauth.facebook.redirectUrl,
    }
  })
  return c.redirect(location, httpStatus.FOUND as StatusCode)
}

const facebookCallback: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const queryParse = c.req.query()
  authValidation.oauthCallback.parse(queryParse)
  const oauthRequest = facebook.users({
    options: {
      clientId: config.oauth.facebook.clientId,
      clientSecret: config.oauth.facebook.clientSecret,
      redirectUrl: config.oauth.facebook.redirectUrl
    },
    request: c.req
  }).then((result) => {
    result.user.name = `${result.user.first_name} ${result.user.last_name}`
    return result
  })
  return oauthCallback(c, oauthRequest, authProviders.FACEBOOK)
}

const linkFacebook: Handler<{ Bindings: Bindings }> = async (c) => {
  const config = getConfig(c.env)
  const bodyParse = await c.req.json()
  const { code } = authValidation.oauthCallback.parse(bodyParse)
  const url = new URL(c.req.url)
  url.searchParams.set('code', code)
  const request = new Request(url.toString())
  const oauthRequest = facebook.users({
    options: {
      clientId: config.oauth.facebook.clientId,
      clientSecret: config.oauth.facebook.clientSecret,
      redirectUrl: config.oauth.facebook.redirectUrl
    },
    request
  })
  return oauthLink(c, oauthRequest, authProviders.FACEBOOK)
}

const deleteFacebookLink: Handler<{ Bindings: Bindings }> = async (c) => {
  return deleteOauthLink(c, authProviders.FACEBOOK)
}

export {
  facebookRedirect,
  facebookCallback,
  linkFacebook,
  deleteFacebookLink
}
