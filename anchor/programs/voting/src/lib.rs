#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

declare_id!("coUnmi3oBUtwtd9fjeAvSsJssXh5A5xyPbhpewyzRVF");

#[program]
pub mod voting {
    use super::*;

    pub fn initialize_poll(ctx: Context<InitializePoll>, 
                            poll_id: u64,
                            description: String,
                            poll_start: u64,
                            poll_end: u64) -> Result<()> {
        // get the current time
        let clock = Clock::get()?;

        // poll end time must be greater than current time. you cannot end a poll in the past.
        require!(poll_end > clock.unix_timestamp as u64, CustomError::PollEndInPast);

        let poll = &mut ctx.accounts.poll;
        poll.poll_id = poll_id;
        poll.description = description;
        poll.poll_start = poll_start;
        poll.poll_end = poll_end;
        poll.candidate_amount = 0;
        Ok(())
    }

    pub fn initialize_candidate(ctx: Context<InitializeCandidate>, 
                                candidate_name: String,
                                _poll_id: u64
                            ) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        candidate.candidate_name = candidate_name;
        candidate.candidate_votes = 0;
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, _candidate_name: String, poll_id: u64) -> Result<()> {
        let candidate = &mut ctx.accounts.candidate;
        let participant = &mut ctx.accounts.participant;
        let poll = &ctx.accounts.poll;

        // get the current time
        let clock = Clock::get()?;

        // check if the poll is active. (poll_start < current_time)
        require!(poll.poll_start < clock.unix_timestamp as u64, CustomError::PollIsNotActive);

        // check if the poll is not ended (poll_end > current_time)
        require!(poll.poll_end > clock.unix_timestamp as u64, CustomError::PollIsExpired);

        if participant.has_voted {
          return Err(error!(VotingError::AlreadyVoted));
        }

        candidate.candidate_votes += 1;
        participant.has_voted = true;
        participant.participant = ctx.accounts.signer.key();
        participant.poll_id = poll_id;

        msg!("Voted for candidate: {}", candidate.candidate_name);
        msg!("Votes: {}", candidate.candidate_votes);
        Ok(())
    }

}

#[derive(Accounts)]
#[instruction(candidate_name: String, poll_id: u64)]
pub struct Vote<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [poll_id.to_le_bytes().as_ref()],
        bump
      )]
    pub poll: Account<'info, Poll>,

    #[account(
      mut,
      seeds = [poll_id.to_le_bytes().as_ref(), candidate_name.as_ref()],
      bump
    )]
    pub candidate: Account<'info, Candidate>,

    #[account(
        init,
        payer = signer,
        space = 8 + Participant::INIT_SPACE,
        seeds = [b"participant", poll_id.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub participant: Pubkey,
    pub poll_id: u64,
    pub has_voted: bool,
}

#[derive(Accounts)]
#[instruction(candidate_name: String, poll_id: u64)]
pub struct InitializeCandidate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [poll_id.to_le_bytes().as_ref()],
        bump
      )]
    pub poll: Account<'info, Poll>,

    #[account(
      init,
      payer = signer,
      space = 8 + Candidate::INIT_SPACE,
      seeds = [poll_id.to_le_bytes().as_ref(), candidate_name.as_ref()],
      bump
    )]
    pub candidate: Account<'info, Candidate>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    #[max_len(32)]
    pub candidate_name: String,
    pub candidate_votes: u64,
}

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct InitializePoll<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
      init,
      payer = signer,
      space = 8 + Poll::INIT_SPACE,
      seeds = [poll_id.to_le_bytes().as_ref()],
      bump
    )]
    pub poll: Account<'info, Poll>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Poll {
    pub poll_id: u64,
    #[max_len(200)]
    pub description: String,
    pub poll_start: u64,
    pub poll_end: u64,
    pub candidate_amount: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("Poll end time cannot be in the past.")]
    PollEndInPast,
    #[msg("Poll is not started yet.")]
    PollIsNotActive,
    #[msg("Poll is expired.")]
    PollIsExpired
}

#[error_code]
pub enum VotingError {
    #[msg("You have already voted in this poll")]
    AlreadyVoted,
}