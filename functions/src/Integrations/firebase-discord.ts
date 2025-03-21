import axios from 'axios'
import * as functions from 'firebase-functions'
import { IModerationStatus } from 'oa-shared'
import { IResearchDB, ResearchUpdateStatus } from 'oa-shared/models/research'

import { CONFIG } from '../config/config'

import type { AxiosError, AxiosResponse } from 'axios'
import type { IMapPin, IResearch } from 'oa-shared/models'

const SITE_URL = CONFIG.deployment.site_url
// e.g. https://dev.onearmy.world or https://community.preciousplastic.com

const DISCORD_WEBHOOK_URL = CONFIG.integrations.discord_webhook

export const notifyPinPublished = functions
  .runWith({ memory: '512MB' })
  .firestore.document('v3_mappins/{pinId}')
  .onUpdate(async (change, context) => {
    const info = (change.after.data() as IMapPin) || null
    const prevInfo = (change.before.data() as IMapPin) || null
    const previouslyAccepted =
      prevInfo?.moderation === IModerationStatus.ACCEPTED
    const shouldNotify =
      info.moderation === IModerationStatus.ACCEPTED && !previouslyAccepted
    if (!shouldNotify) {
      return null
    }
    const { _id, type } = info
    await axios
      .post(DISCORD_WEBHOOK_URL, {
        content: `📍 *New ${type}* pin from ${_id}. \n Location here <${SITE_URL}/map/#${_id}>`,
      })
      .then(handleResponse, handleErr)
      .catch(handleErr)
  })

export const notifyLibraryItemPublished = functions
  .runWith({ memory: '512MB' })
  .firestore.document('v3_howtos/{id}')
  .onUpdate(async (change, context) => {
    const info = change.after.exists ? change.after.data() : null
    const prevInfo = change.before.exists ? change.before.data() : null
    const previouslyAccepted =
      prevInfo?.moderation === IModerationStatus.ACCEPTED
    const shouldNotify =
      info.moderation === IModerationStatus.ACCEPTED && !previouslyAccepted
    if (!shouldNotify) {
      return null
    }
    const { _createdBy, title, slug } = info
    await axios
      .post(DISCORD_WEBHOOK_URL, {
        content: `📓 Yeah! New library project **${title}** by *${_createdBy}*
            check it out: <${SITE_URL}/library/${slug}>`,
      })
      .then(handleResponse, handleErr)
      .catch(handleErr)
  })

export const notifyResearchUpdatePublished = functions
  .runWith({ memory: '512MB' })
  .firestore.document('research_rev20201020/{id}')
  .onUpdate((change) =>
    handleResearchUpdatePublished(
      DISCORD_WEBHOOK_URL,
      change.before.data() as IResearch.ItemDB,
      change.after.data() as IResearch.ItemDB,
      sendDiscordMessage,
    ),
  )

export async function handleResearchUpdatePublished(
  webhookUrl: string,
  previousContent: IResearch.ItemDB,
  updatedContent: IResearch.ItemDB,
  sendMessage: (content: string) => Promise<AxiosResponse<any, any>>,
): Promise<void> {
  if (webhookUrl === '' || webhookUrl === undefined || webhookUrl === null) {
    console.log('No webhook URL configured')
    return
  }

  const previousUpdates = previousContent.updates
  const updatedUpdates = updatedContent.updates

  const lastOldUpdate = previousUpdates[previousUpdates.length - 1]
  const lastNewUpdate = updatedUpdates[updatedUpdates.length - 1]

  if (
    previousUpdates.length >= updatedUpdates.length &&
    lastOldUpdate?.status === lastNewUpdate?.status
  ) {
    console.log('There is no new update')
    return
  }

  if (lastNewUpdate.status === ResearchUpdateStatus.DRAFT) {
    console.log('Update is a draft')
    return
  }

  // On Research Updates, we actually expect the collaborators to be a single person
  // but it is a list.
  // source:
  // https://github.com/ONEARMY/community-platform/issues/3533#issuecomment-2171799601
  const collaborators = lastNewUpdate.collaborators || []
  const author = collaborators[0] || 'unknown'
  const title = lastNewUpdate.title
  const slug = updatedContent.slug

  try {
    const response = await sendMessage(
      `📝 New update from ${author} in their research: ${title}\n` +
        `Learn about it here: <${SITE_URL}/research/${slug}#update_${lastNewUpdate._id}>`,
    )
    handleResponse(response)
  } catch (error) {
    handleErr(error)
  }
}

function sendDiscordMessage(content: string) {
  return axios.post(DISCORD_WEBHOOK_URL, {
    content: content,
  })
}

const handleResponse = (res: AxiosResponse) => {
  console.log('post success')
  return res
}
const handleErr = (err: AxiosError) => {
  console.error('error')
  console.log(err)
  throw err
}
