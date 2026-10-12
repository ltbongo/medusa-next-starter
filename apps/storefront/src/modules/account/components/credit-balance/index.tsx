import { HttpTypes } from "@medusajs/types"

interface CreditBalanceProps {
  _customer: HttpTypes.StoreCustomer | null
}

const CreditBalance = ({ _customer }: CreditBalanceProps) => {
  // Mock data for demo - will be replaced with real subscription data when backend is ready
  const creditsRemaining = 3
  const dailyLimit = 5
  const tierName = "Basic"
  const nextRenewal = "2026-11-12"
  
  return (
    <div className="bg-surface-card rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-light font-display">Account Credits</h3>
        <span className="bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full">
          {tierName} Plan
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-dark/50 rounded-lg p-4">
          <p className="text-muted text-sm mb-1">Credits Remaining</p>
          <p className="text-3xl font-bold text-light">{creditsRemaining}</p>
          <p className="text-muted text-xs mt-1">of {dailyLimit} daily</p>
        </div>
        <div className="bg-dark/50 rounded-lg p-4">
          <p className="text-muted text-sm mb-1">Next Renewal</p>
          <p className="text-xl font-bold text-light">
            {new Date(nextRenewal).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-muted text-xs mt-1">Monthly subscription</p>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted">Daily usage</span>
          <span className="text-light font-semibold">{dailyLimit - creditsRemaining}/{dailyLimit}</span>
        </div>
        <div className="h-2 bg-dark rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent-cyan rounded-full"
            style={{ width: `${((dailyLimit - creditsRemaining) / dailyLimit) * 100}%` }}
          />
        </div>
      </div>
      
      <button className="w-full py-2 rounded-lg bg-light/10 text-light hover:bg-light/20 transition-colors text-sm font-semibold">
        Upgrade Plan
      </button>
    </div>
  )
}

export default CreditBalance
